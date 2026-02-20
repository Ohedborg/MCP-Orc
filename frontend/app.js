const STORAGE_KEY = 'mcp_orc_builder_v4';
const NODE_SPACING = 300;

const state = loadState();

const canvasEl = document.getElementById('canvas');
const nodeCountEl = document.getElementById('node-count');
const savedServersEl = document.getElementById('saved-servers');
const outputEl = document.getElementById('output');

const modal = document.getElementById('node-modal');
const openNodeModalBtn = document.getElementById('open-node-modal');
const tabNewBtn = document.getElementById('tab-new');
const tabSavedBtn = document.getElementById('tab-saved');
const newServerPane = document.getElementById('new-server-pane');
const savedServerPane = document.getElementById('saved-server-pane');

const authTypeEl = document.getElementById('auth-type');
const authFieldsEl = document.getElementById('auth-fields');
const savedPickerEl = document.getElementById('saved-picker');

const serverNameEl = document.getElementById('server-name');
const serverUrlEl = document.getElementById('server-url');
const toolCatalogEl = document.getElementById('tool-catalog');
const guidelineEl = document.getElementById('guideline');

const nodeIdEl = document.getElementById('node-id');
const nodeToolsEl = document.getElementById('node-tools');
const contextModeEl = document.getElementById('context-mode');
const contextBudgetEl = document.getElementById('context-budget');
const keyFieldsEl = document.getElementById('key-fields');
const inputTemplateEl = document.getElementById('input-template');

const connectServerBtn = document.getElementById('connect-server');
const saveNodeBtn = document.getElementById('save-node');
const simulateBtn = document.getElementById('simulate-flow');
const exportBtn = document.getElementById('export-flow');

let modalMode = 'new';
let selectedSavedServerId = null;
let activeServerDraft = null;

renderAuthFields();
renderAll();

openNodeModalBtn.addEventListener('click', () => openModal());
tabNewBtn.addEventListener('click', () => switchModalTab('new'));
tabSavedBtn.addEventListener('click', () => switchModalTab('saved'));
authTypeEl.addEventListener('change', renderAuthFields);
connectServerBtn.addEventListener('click', connectServer);
saveNodeBtn.addEventListener('click', saveNodeToCanvas);
simulateBtn.addEventListener('click', simulateFlow);
exportBtn.addEventListener('click', exportFlow);

function openModal() {
  activeServerDraft = null;
  selectedSavedServerId = state.savedServers[0]?.id || null;
  switchModalTab(state.savedServers.length ? 'saved' : 'new');
  renderSavedPicker();
  hydrateTools([]);
  modal.showModal();
}

function switchModalTab(mode) {
  modalMode = mode;
  const isNew = mode === 'new';

  tabNewBtn.classList.toggle('active', isNew);
  tabSavedBtn.classList.toggle('active', !isNew);
  newServerPane.classList.toggle('active', isNew);
  savedServerPane.classList.toggle('active', !isNew);

  if (!isNew) {
    renderSavedPicker();
    const server = getSelectedSavedServer();
    hydrateTools(server?.tools || []);
  }
}

function renderAuthFields() {
  const authType = authTypeEl.value;
  let html = '';

  if (authType === 'api_key') {
    html = `
      <label>API key name <input data-auth="api_key_name" placeholder="x-api-key" /></label>
      <label>API key value <input data-auth="api_key_value" type="password" placeholder="••••••••" /></label>
      <label>Placement
        <select data-auth="api_key_location">
          <option value="header">Header</option>
          <option value="query">Query</option>
        </select>
      </label>
    `;
  } else if (authType === 'oauth') {
    html = `
      <label>Client ID <input data-auth="client_id" placeholder="oauth-client-id" /></label>
      <label>Client secret <input data-auth="client_secret" type="password" placeholder="••••••••" /></label>
      <label>Authorize URL <input data-auth="authorize_url" placeholder="https://.../authorize" /></label>
      <label>Token URL <input data-auth="token_url" placeholder="https://.../token" /></label>
      <label>Scopes <input data-auth="scopes" placeholder="files:read files:write" /></label>
    `;
  } else if (authType === 'bearer') {
    html = '<label>Bearer token <input data-auth="token" type="password" placeholder="••••••••" /></label>';
  } else if (authType === 'basic') {
    html = `
      <label>Username <input data-auth="username" placeholder="service-user" /></label>
      <label>Password <input data-auth="password" type="password" placeholder="••••••••" /></label>
    `;
  } else {
    html = '<p class="hint">No authentication configured.</p>';
  }

  authFieldsEl.innerHTML = html;
}

function connectServer() {
  const server = modalMode === 'new' ? buildServerFromForm() : getSelectedSavedServer();
  if (!server) {
    outputEl.textContent = 'Select a saved MCP server or fill new server details first.';
    return;
  }

  if (!server.name || !server.base_url) {
    outputEl.textContent = 'Server requires name + base URL.';
    return;
  }

  const tools = server.tools.length ? server.tools : ['list_tools'];
  activeServerDraft = {
    ...server,
    connected: true,
    tools,
  };

  hydrateTools(tools);
  outputEl.textContent = `Connected to ${server.name}. Loaded ${tools.length} tool(s).`;
}

function saveNodeToCanvas() {
  if (!activeServerDraft) {
    outputEl.textContent = 'Connect a server first to load tools.';
    return;
  }

  const nodeId = nodeIdEl.value.trim();
  if (!nodeId) {
    outputEl.textContent = 'Node id is required.';
    return;
  }

  if (state.nodes.some((node) => node.id === nodeId)) {
    outputEl.textContent = `Node id "${nodeId}" already exists.`;
    return;
  }

  const selectedTools = Array.from(nodeToolsEl.selectedOptions).map((option) => option.value);
  if (!selectedTools.length) {
    outputEl.textContent = 'Select at least one tool for this node.';
    return;
  }

  const inputTemplate = inputTemplateEl.value.trim();
  try {
    JSON.parse(inputTemplate);
  } catch {
    outputEl.textContent = 'Input template must be valid JSON.';
    return;
  }

  const node = {
    id: nodeId,
    server_id: activeServerDraft.id,
    server_name: activeServerDraft.name,
    server_url: activeServerDraft.base_url,
    auth: activeServerDraft.auth,
    selected_tools: selectedTools,
    context_policy: {
      mode: contextModeEl.value,
      max_tokens: Number(contextBudgetEl.value || 2048),
      key_fields: splitCsv(keyFieldsEl.value),
    },
    input_template: inputTemplate,
  };

  state.nodes.push(node);
  upsertSavedServer(activeServerDraft);
  persist();
  renderAll();
  modal.close();
}

function simulateFlow() {
  if (!state.nodes.length) {
    outputEl.textContent = 'Add at least one node to simulate.';
    return;
  }

  let previous = {
    summary: 'Initial user prompt summary',
    key_fields: { intent: 'build ui component' },
    chunks: [],
  };

  const trace = state.nodes.map((node, index) => {
    const renderedInput = JSON.parse(
      node.input_template
        .replaceAll('{{user.prompt}}', '"Build dashboard from figma"')
        .replaceAll('{{previous.summary}}', JSON.stringify(previous.summary)),
    );

    const simulatedPayload = {
      raw_size_chars: 24000 + index * 12000,
      summary: `Summary from ${node.server_name}`,
      key_fields: {
        server: node.server_name,
        primary_tool: node.selected_tools[0],
      },
      chunks: [`ctx-${node.id}-001`, `ctx-${node.id}-002`],
    };

    previous = applyContextPolicy(simulatedPayload, node.context_policy);

    return {
      node_id: node.id,
      server: node.server_name,
      selected_tools: node.selected_tools,
      input: renderedInput,
      context_policy: node.context_policy,
      output_context_packet: previous,
    };
  });

  outputEl.textContent = JSON.stringify(
    {
      simulation: trace,
      note: 'Context is compressed per-node policy to avoid overwhelming downstream context windows.',
    },
    null,
    2,
  );
}

function exportFlow() {
  if (!state.nodes.length) {
    outputEl.textContent = 'Add nodes before export.';
    return;
  }

  const config = {
    composed_mcp: {
      name: 'mcp-orc-composed-server',
      generated_at: new Date().toISOString(),
      servers: state.savedServers.map((server) => ({
        id: server.id,
        name: server.name,
        base_url: server.base_url,
        auth: redactAuth(server.auth),
        tools: server.tools,
        guideline_md: server.guideline || null,
      })),
      workflow_nodes: state.nodes.map((node, index) => ({
        order: index + 1,
        id: node.id,
        server_id: node.server_id,
        selected_tools: node.selected_tools,
        context_policy: node.context_policy,
        input_template: node.input_template,
      })),
      context_strategy: {
        default: 'summary + key_fields + optional chunk references',
        rationale: 'Avoid exceeding context window by compressing large MCP payloads between nodes.',
      },
      ide_usage: {
        model: 'IDE connects to one MCP-Orc endpoint only.',
        client_config_example: {
          mcpServers: {
            'mcp-orc': {
              command: 'node',
              args: ['orchestrator/dist/index.js'],
            },
          },
        },
      },
    },
  };

  outputEl.textContent = JSON.stringify(config, null, 2);
}

function renderAll() {
  renderSavedServers();
  renderCanvas();
}

function renderSavedServers() {
  if (!state.savedServers.length) {
    savedServersEl.innerHTML = '<p class="item">No saved servers yet.</p>';
    return;
  }

  savedServersEl.innerHTML = state.savedServers
    .map(
      (server) => `
      <article class="item">
        <div class="row">
          <h4>${escapeHtml(server.name)}</h4>
          <button type="button" class="danger" data-remove-server="${server.id}">Delete</button>
        </div>
        <p><strong>URL:</strong> ${escapeHtml(server.base_url)}</p>
        <p><strong>Auth:</strong> ${escapeHtml(server.auth.type)}</p>
        <p><strong>Tools:</strong> ${escapeHtml(server.tools.join(', '))}</p>
      </article>
    `,
    )
    .join('');

  document.querySelectorAll('[data-remove-server]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-remove-server');
      state.savedServers = state.savedServers.filter((server) => server.id !== id);
      state.nodes = state.nodes.filter((node) => node.server_id !== id);
      persist();
      renderAll();
    });
  });
}

function renderSavedPicker() {
  if (!state.savedServers.length) {
    savedPickerEl.innerHTML = '<p class="hint">No saved servers yet. Switch to Create New Server.</p>';
    return;
  }

  savedPickerEl.innerHTML = state.savedServers
    .map(
      (server) => `
      <label class="pick ${selectedSavedServerId === server.id ? 'selected' : ''}">
        <input type="radio" name="saved-server" value="${server.id}" ${selectedSavedServerId === server.id ? 'checked' : ''} />
        <span>
          <strong>${escapeHtml(server.name)}</strong><br />
          <small>${escapeHtml(server.base_url)} · ${escapeHtml(server.auth.type)}</small>
        </span>
      </label>
    `,
    )
    .join('');

  document.querySelectorAll('input[name="saved-server"]').forEach((input) => {
    input.addEventListener('change', () => {
      selectedSavedServerId = input.value;
      renderSavedPicker();
      const server = getSelectedSavedServer();
      hydrateTools(server?.tools || []);
    });
  });
}

function renderCanvas() {
  nodeCountEl.textContent = `${state.nodes.length} ${state.nodes.length === 1 ? 'node' : 'nodes'}`;

  if (!state.nodes.length) {
    canvasEl.innerHTML = '<p class="empty">No workflow nodes yet.</p>';
    return;
  }

  const width = Math.max(1100, state.nodes.length * NODE_SPACING + 120);
  const content = [`<div class="track" style="width:${width}px">`, '<div class="line"></div>'];

  state.nodes.forEach((node, index) => {
    const left = 20 + index * NODE_SPACING;

    content.push(`
      <article class="node" style="left:${left}px">
        <header>
          <h3>${index + 1}. ${escapeHtml(node.id)}</h3>
          <span class="chip">${escapeHtml(node.context_policy.mode)}</span>
        </header>
        <p><strong>MCP:</strong> ${escapeHtml(node.server_name)}</p>
        <p><strong>Tools:</strong> ${escapeHtml(node.selected_tools.join(', '))}</p>
        <p><strong>Budget:</strong> ${node.context_policy.max_tokens} tokens</p>
        <div class="controls">
          <button type="button" data-move-left="${escapeHtml(node.id)}">←</button>
          <button type="button" data-move-right="${escapeHtml(node.id)}">→</button>
          <button type="button" class="danger" data-remove-node="${escapeHtml(node.id)}">Remove</button>
        </div>
      </article>
    `);

    if (index < state.nodes.length - 1) {
      content.push(`<span class="arrow" style="left:${left + 245}px">➜</span>`);
    }

    content.push(`<button type="button" class="plus" data-insert-after="${escapeHtml(node.id)}" style="left:${left + 270}px">+</button>`);
  });

  content.push('</div>');
  canvasEl.innerHTML = content.join('');

  document.querySelectorAll('[data-remove-node]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-remove-node');
      state.nodes = state.nodes.filter((node) => node.id !== id);
      persist();
      renderCanvas();
    });
  });

  document.querySelectorAll('[data-move-left]').forEach((button) => {
    button.addEventListener('click', () => moveNode(button.getAttribute('data-move-left'), -1));
  });

  document.querySelectorAll('[data-move-right]').forEach((button) => {
    button.addEventListener('click', () => moveNode(button.getAttribute('data-move-right'), 1));
  });

  document.querySelectorAll('[data-insert-after]').forEach((button) => {
    button.addEventListener('click', () => {
      outputEl.textContent = 'Use + Add MCP Node to configure the next server and tools, then add it to canvas.';
      openModal();
    });
  });
}

function moveNode(nodeId, delta) {
  const index = state.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) return;

  const target = index + delta;
  if (target < 0 || target >= state.nodes.length) return;

  const [node] = state.nodes.splice(index, 1);
  state.nodes.splice(target, 0, node);
  persist();
  renderCanvas();
}

function getSelectedSavedServer() {
  return state.savedServers.find((server) => server.id === selectedSavedServerId) || null;
}

function buildServerFromForm() {
  const auth = collectAuth();

  return {
    id: crypto.randomUUID(),
    name: serverNameEl.value.trim(),
    base_url: serverUrlEl.value.trim(),
    tools: splitCsv(toolCatalogEl.value),
    guideline: guidelineEl.value.trim(),
    auth,
  };
}

function collectAuth() {
  const type = authTypeEl.value;
  const details = {};

  authFieldsEl.querySelectorAll('[data-auth]').forEach((input) => {
    const key = input.getAttribute('data-auth');
    details[key] = input.value;
  });

  return { type, details };
}

function hydrateTools(tools) {
  nodeToolsEl.innerHTML = tools
    .map((tool) => `<option value="${escapeHtml(tool)}">${escapeHtml(tool)}</option>`)
    .join('');
}

function upsertSavedServer(server) {
  const existing = state.savedServers.findIndex((item) => item.name === server.name && item.base_url === server.base_url);

  if (existing >= 0) {
    state.savedServers[existing] = { ...state.savedServers[existing], ...server };
    return;
  }

  state.savedServers.push(server);
}

function applyContextPolicy(payload, policy) {
  if (policy.mode === 'full') {
    return {
      summary: payload.summary,
      key_fields: payload.key_fields,
      chunks: payload.chunks,
      raw_size_chars: payload.raw_size_chars,
    };
  }

  if (policy.mode === 'key_fields') {
    const filtered = {};
    const allow = policy.key_fields.length ? policy.key_fields : Object.keys(payload.key_fields);
    for (const key of allow) {
      if (key in payload.key_fields) filtered[key] = payload.key_fields[key];
    }
    return {
      summary: payload.summary,
      key_fields: filtered,
      chunks: [],
      token_budget: policy.max_tokens,
    };
  }

  if (policy.mode === 'chunked') {
    return {
      summary: payload.summary,
      key_fields: payload.key_fields,
      chunks: payload.chunks,
      retrieval_hint: 'Load chunk references as-needed in the next node.',
      token_budget: policy.max_tokens,
    };
  }

  return {
    summary: payload.summary,
    key_fields: payload.key_fields,
    chunks: [],
    token_budget: policy.max_tokens,
  };
}

function redactAuth(auth) {
  return {
    type: auth.type,
    details: Object.fromEntries(Object.keys(auth.details || {}).map((key) => [key, '<redacted>'])),
  };
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { savedServers: [], nodes: [] };

  try {
    const parsed = JSON.parse(raw);
    return {
      savedServers: Array.isArray(parsed.savedServers) ? parsed.savedServers : [],
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
    };
  } catch {
    return { savedServers: [], nodes: [] };
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
