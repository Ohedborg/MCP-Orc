const STORAGE_KEY = 'mcp_orc_builder_v6';

const state = loadState();

const outputEl = document.getElementById('output');
const serverListEl = document.getElementById('server-list');
const mcpJsonEl = document.getElementById('mcp-json');
const flowNodesEl = document.getElementById('flow-nodes');

const serverModal = document.getElementById('server-modal');
const nodeModal = document.getElementById('node-modal');

const openServerModalBtn = document.getElementById('open-server-modal');
const addTriggerBtn = document.getElementById('add-trigger');
const addAfterTriggerBtn = document.getElementById('add-after-trigger');

const serverNameEl = document.getElementById('server-name');
const serverUrlEl = document.getElementById('server-url');
const authTypeEl = document.getElementById('auth-type');
const authFieldsEl = document.getElementById('auth-fields');
const toolHintsEl = document.getElementById('tool-hints');
const connStatusEl = document.getElementById('conn-status');

const verifyConnectionBtn = document.getElementById('verify-connection');
const startOauthBtn = document.getElementById('start-oauth');
const saveServerBtn = document.getElementById('save-server');

const nodeServerEl = document.getElementById('node-server');
const nodeIdEl = document.getElementById('node-id');
const nodeToolsEl = document.getElementById('node-tools');
const contextModeEl = document.getElementById('context-mode');
const tokenBudgetEl = document.getElementById('token-budget');
const addNodeBtn = document.getElementById('add-node');

const loadJsonBtn = document.getElementById('load-json');
const saveJsonBtn = document.getElementById('save-json');

let connectedDraft = null;

renderAuthFields();
renderAll();

openServerModalBtn.addEventListener('click', () => {
  resetServerModal();
  serverModal.showModal();
});

addTriggerBtn.addEventListener('click', () => openNodePicker());
addAfterTriggerBtn.addEventListener('click', () => openNodePicker());

authTypeEl.addEventListener('change', renderAuthFields);
verifyConnectionBtn.addEventListener('click', () => verifyConnection('manual'));
startOauthBtn.addEventListener('click', () => verifyConnection('oauth'));
saveServerBtn.addEventListener('click', saveServer);

nodeServerEl.addEventListener('change', () => fillToolOptions(nodeServerEl.value));
addNodeBtn.addEventListener('click', addNode);

loadJsonBtn.addEventListener('click', loadFromJson);
saveJsonBtn.addEventListener('click', saveToJson);

function renderAll() {
  renderServers();
  renderFlow();
  saveToJson();
}

function renderAuthFields() {
  const auth = authTypeEl.value;
  if (auth === 'api_key') {
    authFieldsEl.innerHTML = '<label>API Key <input id="auth-api-key" type="password" placeholder="••••••" /></label>';
    return;
  }
  if (auth === 'bearer') {
    authFieldsEl.innerHTML = '<label>Bearer Token <input id="auth-bearer" type="password" placeholder="••••••" /></label>';
    return;
  }
  if (auth === 'oauth') {
    authFieldsEl.innerHTML = '<p class="muted">Click “Start OAuth” to initiate auth. No manual client fields needed.</p>';
    return;
  }
  authFieldsEl.innerHTML = '<p class="muted">No authentication needed.</p>';
}

async function verifyConnection(mode) {
  const server = buildServerDraft();
  if (!server.name || !server.url) {
    outputEl.textContent = 'Server requires name + URL before verification.';
    return;
  }

  if (server.auth.type === 'oauth') {
    if (mode !== 'oauth') {
      outputEl.textContent = 'For OAuth servers, click “Start OAuth”.';
      return;
    }
    server.auth.details.oauth = 'initiated';
  }

  connStatusEl.textContent = 'Verifying connection and discovering tools...';

  const discovery = await discoverViaProxy(server);
  const discoveredTools = discovery.tools.length ? discovery.tools : server.toolHints;

  connectedDraft = {
    ...server,
    connected: discovery.ok,
    enabled: true,
    tools: discoveredTools,
    verifiedAt: new Date().toISOString(),
    status: discovery.ok ? 'verified' : 'failed',
    lastError: discovery.ok ? '' : discovery.error,
  };

  if (discovery.ok) {
    connStatusEl.textContent = `Connected. ${discoveredTools.length} tools discovered.`;
    outputEl.textContent = `Verified ${server.name}. Tools are now available for node selection.`;
  } else {
    connStatusEl.textContent = `Verification failed: ${discovery.error}`;
    outputEl.textContent = `Could not verify ${server.name}. ${discovery.error}`;
  }
}

async function discoverViaProxy(server) {
  try {
    const response = await fetch('/mcp/discover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        server_url: server.url,
        auth: server.auth,
      }),
    });

    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: body.error || `HTTP ${response.status}`, tools: [] };
    }

    return {
      ok: Boolean(body.ok),
      error: body.error || '',
      tools: Array.isArray(body.tools) ? body.tools : [],
    };
  } catch (error) {
    return { ok: false, error: String(error.message || error), tools: [] };
  }
}

function saveServer() {
  if (!connectedDraft || !connectedDraft.connected) {
    outputEl.textContent = 'Verify a successful connection first. Only verified servers expose tools.';
    return;
  }

  upsertServer(connectedDraft);
  persist();
  renderAll();
  serverModal.close();
}

function buildServerDraft() {
  const authType = authTypeEl.value;
  const authDetails = {};

  if (authType === 'api_key') authDetails.api_key = document.getElementById('auth-api-key')?.value || '';
  if (authType === 'bearer') authDetails.token = document.getElementById('auth-bearer')?.value || '';

  return {
    id: crypto.randomUUID(),
    name: serverNameEl.value.trim(),
    url: serverUrlEl.value.trim(),
    auth: { type: authType, details: authDetails },
    toolHints: splitCsv(toolHintsEl.value),
    tools: [],
  };
}

function upsertServer(server) {
  const idx = state.servers.findIndex((item) => item.name === server.name && item.url === server.url);
  if (idx >= 0) {
    state.servers[idx] = { ...state.servers[idx], ...server };
    return;
  }
  state.servers.push(server);
}

function renderServers() {
  if (!state.servers.length) {
    serverListEl.innerHTML = '<p class="server-meta">No servers configured.</p>';
    return;
  }

  serverListEl.innerHTML = state.servers.map((server) => `
    <article class="server-item">
      <div class="server-head">
        <div>
          <strong>${escapeHtml(server.name)}</strong>
          <div class="server-meta">${escapeHtml(server.tools.length)} tools · ${escapeHtml(server.auth.type)}</div>
          <div class="server-status">${server.connected ? '✅ verified' : '⚠️ unverified'} ${server.lastError ? `· ${escapeHtml(server.lastError)}` : ''}</div>
        </div>
        <button class="toggle ${server.enabled ? 'on' : ''}" data-toggle="${server.id}" aria-label="toggle"></button>
      </div>
      <div class="server-meta">${escapeHtml(server.url)}</div>
      <div class="server-actions">
        <button class="ghost" data-open-node="${server.id}">Add to flow</button>
        <button class="warn" data-reverify="${server.id}">Re-verify</button>
        <button class="ghost" data-delete-server="${server.id}">Delete</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-toggle');
      const server = state.servers.find((item) => item.id === id);
      if (!server) return;
      server.enabled = !server.enabled;
      persist();
      renderServers();
    });
  });

  document.querySelectorAll('[data-delete-server]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-delete-server');
      state.servers = state.servers.filter((item) => item.id !== id);
      state.nodes = state.nodes.filter((node) => node.serverId !== id);
      persist();
      renderAll();
    });
  });

  document.querySelectorAll('[data-open-node]').forEach((el) => {
    el.addEventListener('click', () => openNodePicker(el.getAttribute('data-open-node')));
  });

  document.querySelectorAll('[data-reverify]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.getAttribute('data-reverify');
      const server = state.servers.find((item) => item.id === id);
      if (!server) return;

      const discovery = await discoverViaProxy(server);
      server.connected = discovery.ok;
      server.tools = discovery.tools.length ? discovery.tools : server.tools;
      server.lastError = discovery.ok ? '' : discovery.error;
      server.status = discovery.ok ? 'verified' : 'failed';
      persist();
      renderServers();
    });
  });
}

function openNodePicker(serverId = '') {
  fillServerOptions(serverId);
  fillToolOptions(nodeServerEl.value);
  nodeModal.showModal();
}

function fillServerOptions(selected) {
  const available = state.servers.filter((server) => server.connected && server.enabled && server.tools.length > 0);
  if (!available.length) {
    nodeServerEl.innerHTML = '<option value="">No verified servers with tools</option>';
    nodeToolsEl.innerHTML = '';
    return;
  }

  nodeServerEl.innerHTML = available.map((server) => `
    <option value="${server.id}" ${selected === server.id ? 'selected' : ''}>${escapeHtml(server.name)}</option>
  `).join('');
}

function fillToolOptions(serverId) {
  const server = state.servers.find((item) => item.id === serverId);
  if (!server || !server.connected || !server.tools.length) {
    nodeToolsEl.innerHTML = '';
    return;
  }

  nodeToolsEl.innerHTML = server.tools.map((tool) => `<option value="${escapeHtml(tool)}">${escapeHtml(tool)}</option>`).join('');
}

function addNode() {
  const serverId = nodeServerEl.value;
  const nodeId = nodeIdEl.value.trim() || `step_${state.nodes.length + 1}`;
  const selectedTools = Array.from(nodeToolsEl.selectedOptions).map((opt) => opt.value);

  if (!serverId) {
    outputEl.textContent = 'Pick a verified server first.';
    return;
  }
  if (!selectedTools.length) {
    outputEl.textContent = 'Select at least one discovered tool.';
    return;
  }
  if (state.nodes.some((node) => node.id === nodeId)) {
    outputEl.textContent = `Node id ${nodeId} already exists.`;
    return;
  }

  const server = state.servers.find((item) => item.id === serverId);
  state.nodes.push({
    id: nodeId,
    serverId,
    serverName: server?.name || 'Unknown',
    tools: selectedTools,
    contextMode: contextModeEl.value,
    tokenBudget: Number(tokenBudgetEl.value || 2048),
  });

  persist();
  renderFlow();
  nodeModal.close();
}

function renderFlow() {
  flowNodesEl.innerHTML = '';

  if (!state.nodes.length) return;

  state.nodes.forEach((node) => {
    const wrap = document.createElement('div');
    wrap.className = 'node-stack';
    wrap.innerHTML = `
      <article class="node">
        <h4>${escapeHtml(node.id)}</h4>
        <p><strong>Server:</strong> ${escapeHtml(node.serverName)}</p>
        <p><strong>Tools:</strong> ${escapeHtml(node.tools.join(', '))}</p>
        <p><strong>Context:</strong> ${escapeHtml(node.contextMode)} · ${node.tokenBudget} tokens</p>
        <div class="node-actions">
          <button class="warn" data-remove-node="${escapeHtml(node.id)}">Remove</button>
        </div>
      </article>
      <div class="line"></div>
      <button class="plus-btn" data-after-node="${escapeHtml(node.id)}">+</button>
    `;
    flowNodesEl.appendChild(wrap);
  });

  flowNodesEl.querySelectorAll('[data-after-node]').forEach((btn) => {
    btn.addEventListener('click', () => openNodePicker());
  });

  flowNodesEl.querySelectorAll('[data-remove-node]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nodeId = btn.getAttribute('data-remove-node');
      state.nodes = state.nodes.filter((node) => node.id !== nodeId);
      persist();
      renderFlow();
    });
  });
}

function loadFromJson() {
  try {
    const parsed = JSON.parse(mcpJsonEl.value || '{}');
    const servers = Object.entries(parsed.mcpServers || {}).map(([name, cfg]) => {
      const tools = parseToolsFromConfig(cfg);
      return {
        id: crypto.randomUUID(),
        name,
        url: cfg.url || 'local://stdio',
        auth: cfg.auth || { type: 'none', details: {} },
        toolHints: tools,
        tools,
        connected: tools.length > 0,
        enabled: cfg.enabled !== false,
        status: tools.length > 0 ? 'verified' : 'unverified',
        lastError: tools.length ? '' : 'No tools in config. Re-verify to discover.',
      };
    });

    state.servers = servers;
    state.nodes = [];
    persist();
    renderAll();
    outputEl.textContent = `Loaded ${servers.length} servers from mcp.json.`;
  } catch (error) {
    outputEl.textContent = `Invalid mcp.json: ${error.message}`;
  }
}

function parseToolsFromConfig(cfg = {}) {
  if (Array.isArray(cfg.tools)) return cfg.tools;
  if (Array.isArray(cfg.toolNames)) return cfg.toolNames;
  if (Array.isArray(cfg.availableTools)) return cfg.availableTools;
  if (cfg.capabilities?.tools && typeof cfg.capabilities.tools === 'object') {
    return Object.keys(cfg.capabilities.tools);
  }
  return [];
}

function saveToJson() {
  const json = {
    mcpServers: Object.fromEntries(
      state.servers.map((server) => [server.name, {
        url: server.url,
        auth: { type: server.auth.type, details: '<redacted>' },
        tools: server.tools,
        enabled: server.enabled,
        verified: server.connected,
      }]),
    ),
    workflow: state.nodes.map((node, i) => ({
      order: i + 1,
      id: node.id,
      server: node.serverName,
      tools: node.tools,
      contextMode: node.contextMode,
      tokenBudget: node.tokenBudget,
    })),
    contextPolicy: 'Pass summary/key fields/chunk references to avoid context window overload.',
  };

  mcpJsonEl.value = JSON.stringify(json, null, 2);
}

function resetServerModal() {
  connectedDraft = null;
  serverNameEl.value = '';
  serverUrlEl.value = '';
  authTypeEl.value = 'none';
  toolHintsEl.value = '';
  connStatusEl.textContent = 'Not connected.';
  renderAuthFields();
}

function splitCsv(value) {
  return String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { servers: [], nodes: [] };
  try {
    const parsed = JSON.parse(raw);
    return {
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    };
  } catch {
    return { servers: [], nodes: [] };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
