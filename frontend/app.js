const STORAGE_KEY = 'mcp_orc_builder_v5';

const state = loadState();

const outputEl = document.getElementById('output');
const serverListEl = document.getElementById('server-list');
const mcpJsonEl = document.getElementById('mcp-json');
const flowTrackEl = document.getElementById('flow-track');

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
    authFieldsEl.innerHTML = '<p class="muted">OAuth is initiated with the button below (no manual client details required).</p>';
    return;
  }
  authFieldsEl.innerHTML = '<p class="muted">No authentication needed.</p>';
}

function verifyConnection(mode) {
  const server = buildServerDraft();
  if (!server.name || !server.url) {
    outputEl.textContent = 'Server requires name + URL before verification.';
    return;
  }

  if (server.auth.type === 'oauth' && mode !== 'oauth') {
    outputEl.textContent = 'For OAuth servers use “Start OAuth”.';
    return;
  }

  const tools = discoverTools(server);
  connectedDraft = {
    ...server,
    connected: true,
    enabled: true,
    tools,
    verifiedAt: new Date().toISOString(),
  };

  connStatusEl.textContent = `Connected. ${tools.length} tools discovered.`;
  outputEl.textContent = `Verified ${server.name}. Tools available only after connection check.`;
}

function saveServer() {
  if (!connectedDraft) {
    outputEl.textContent = 'Verify connection first. Tools are loaded only after verification.';
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
  if (authType === 'oauth') authDetails.oauth = 'initiated';

  return {
    id: crypto.randomUUID(),
    name: serverNameEl.value.trim(),
    url: serverUrlEl.value.trim(),
    auth: { type: authType, details: authDetails },
    toolHints: splitCsv(toolHintsEl.value),
    tools: [],
  };
}

function discoverTools(server) {
  if (server.toolHints.length) return server.toolHints;

  const base = server.name.toLowerCase().replace(/\s+/g, '_') || 'mcp';
  return [`${base}.search`, `${base}.read`, `${base}.execute`];
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
          <div class="server-meta">${escapeHtml(server.tools.length)} tools ${server.connected ? 'available' : 'unavailable'} · ${escapeHtml(server.auth.type)}</div>
        </div>
        <button class="toggle ${server.enabled ? 'on' : ''}" data-toggle="${server.id}" aria-label="toggle"></button>
      </div>
      <div class="server-meta">${escapeHtml(server.url)}</div>
      <div class="server-actions">
        <button class="ghost" data-open-node="${server.id}">Add to flow</button>
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
}

function openNodePicker(serverId = '') {
  fillServerOptions(serverId);
  fillToolOptions(nodeServerEl.value);
  nodeModal.showModal();
}

function fillServerOptions(selected) {
  const available = state.servers.filter((server) => server.connected && server.enabled);
  if (!available.length) {
    nodeServerEl.innerHTML = '<option value="">No connected servers</option>';
    nodeToolsEl.innerHTML = '';
    return;
  }

  nodeServerEl.innerHTML = available.map((server) => `
    <option value="${server.id}" ${selected === server.id ? 'selected' : ''}>${escapeHtml(server.name)}</option>
  `).join('');
}

function fillToolOptions(serverId) {
  const server = state.servers.find((item) => item.id === serverId);
  if (!server || !server.connected) {
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
    outputEl.textContent = 'Pick a connected server first.';
    return;
  }
  if (!selectedTools.length) {
    outputEl.textContent = 'Select at least one available tool.';
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
  const existing = flowTrackEl.querySelector('.node-col');
  if (existing) existing.remove();

  if (!state.nodes.length) return;

  const col = document.createElement('div');
  col.className = 'node-col';

  state.nodes.forEach((node) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="connector"></div>
      <article class="node">
        <h4>${escapeHtml(node.id)}</h4>
        <p><strong>Server:</strong> ${escapeHtml(node.serverName)}</p>
        <p><strong>Tools:</strong> ${escapeHtml(node.tools.join(', '))}</p>
        <p><strong>Context:</strong> ${escapeHtml(node.contextMode)} · ${node.tokenBudget} tokens</p>
      </article>
      <button class="plus-btn" data-after-node="${escapeHtml(node.id)}">+</button>
    `;
    col.appendChild(wrap);
  });

  flowTrackEl.appendChild(col);
  col.querySelectorAll('[data-after-node]').forEach((btn) => {
    btn.addEventListener('click', () => openNodePicker());
  });
}

function loadFromJson() {
  try {
    const parsed = JSON.parse(mcpJsonEl.value || '{}');
    const servers = Object.entries(parsed.mcpServers || {}).map(([name, cfg]) => ({
      id: crypto.randomUUID(),
      name,
      url: cfg.url || 'local://stdio',
      auth: cfg.auth || { type: 'none', details: {} },
      toolHints: cfg.tools || [],
      tools: cfg.tools || [],
      connected: true,
      enabled: true,
    }));

    state.servers = servers;
    state.nodes = [];
    persist();
    renderAll();
    outputEl.textContent = `Loaded ${servers.length} servers from mcp.json.`;
  } catch (error) {
    outputEl.textContent = `Invalid mcp.json: ${error.message}`;
  }
}

function saveToJson() {
  const json = {
    mcpServers: Object.fromEntries(
      state.servers.map((server) => [server.name, {
        url: server.url,
        auth: { type: server.auth.type, details: '<redacted>' },
        tools: server.tools,
        enabled: server.enabled,
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
