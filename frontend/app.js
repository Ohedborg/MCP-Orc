const STORAGE_KEY = 'mcp_orc_frontend_state_v3';
const NODE_SPACING = 250;

const registerForm = document.getElementById('register-server-form');
const addStepForm = document.getElementById('add-step-form');
const serverListEl = document.getElementById('server-list');
const outputEl = document.getElementById('output');
const serverSelectEl = document.getElementById('server-select');
const toolSelectEl = document.getElementById('tool-select');
const simulateBtn = document.getElementById('simulate-chain');
const exportBtn = document.getElementById('export-config');
const canvasEl = document.getElementById('canvas');
const chainCountEl = document.getElementById('chain-count');

const state = loadState();
render();

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(registerForm);

  const server = {
    id: crypto.randomUUID(),
    name: String(data.get('name') || '').trim(),
    base_url: String(data.get('base_url') || '').trim(),
    tools: String(data.get('tools') || '')
      .split(',')
      .map((tool) => tool.trim())
      .filter(Boolean),
    guideline: String(data.get('guideline') || '').trim(),
  };

  if (!server.name || !server.base_url || !server.tools.length) {
    outputEl.textContent = 'Server requires name, base URL, and at least one tool.';
    return;
  }

  state.servers.push(server);
  persist();
  registerForm.reset();
  render();
});

addStepForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(addStepForm);
  const step = {
    id: String(data.get('step_id') || '').trim(),
    server_id: String(data.get('server_id') || '').trim(),
    tool_name: String(data.get('tool_name') || '').trim(),
    input_template: String(data.get('input_template') || '').trim(),
  };

  if (!step.id || !step.server_id || !step.tool_name || !step.input_template) {
    outputEl.textContent = 'Step requires id, server, tool, and JSON input template.';
    return;
  }

  if (state.chain.some((item) => item.id === step.id)) {
    outputEl.textContent = `Step id "${step.id}" already exists.`;
    return;
  }

  try {
    JSON.parse(step.input_template);
  } catch {
    outputEl.textContent = 'Step input template must be valid JSON.';
    return;
  }

  state.chain.push(step);
  persist();
  addStepForm.reset();
  render();
});

serverSelectEl.addEventListener('change', () => {
  fillToolOptions(serverSelectEl.value);
});

simulateBtn.addEventListener('click', () => {
  const trace = [];
  let previousOutput = 'initial-user-input';

  for (const [index, step] of state.chain.entries()) {
    const server = state.servers.find((item) => item.id === step.server_id);
    if (!server) continue;

    const input = JSON.parse(step.input_template.replaceAll('{{previous.output}}', JSON.stringify(previousOutput)));
    const result = {
      order: index + 1,
      step_id: step.id,
      server: server.name,
      tool: step.tool_name,
      input,
      output: `simulated-output-from-${server.name}.${step.tool_name}`,
    };

    previousOutput = result.output;
    trace.push(result);
  }

  outputEl.textContent = JSON.stringify({ simulation: trace }, null, 2);
});

exportBtn.addEventListener('click', () => {
  if (!state.servers.length || !state.chain.length) {
    outputEl.textContent = 'Add at least one server and one chain step before exporting.';
    return;
  }

  const config = {
    composed_mcp: {
      name: 'mcp-orc-composed-server',
      description: 'Single upstream MCP endpoint orchestrating chained downstream MCP servers.',
      generated_at: new Date().toISOString(),
      servers: state.servers.map((server) => ({
        id: server.id,
        name: server.name,
        base_url: server.base_url,
        tools: server.tools,
        guideline_md: server.guideline || null,
      })),
      workflow: state.chain.map((step, index) => ({
        order: index + 1,
        id: step.id,
        server_id: step.server_id,
        tool_name: step.tool_name,
        input_template: step.input_template,
        context_from_previous_step: step.input_template.includes('{{previous.output}}'),
      })),
      ide_usage: {
        model: 'IDE connects only to MCP-Orc upstream endpoint instead of multiple MCP servers.',
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
});

function render() {
  renderServerSelect();
  renderServerList();
  renderCanvas();
}

function renderServerSelect() {
  const options = ['<option value="">Select server</option>'];
  for (const server of state.servers) {
    options.push(`<option value="${server.id}">${escapeHtml(server.name)}</option>`);
  }
  serverSelectEl.innerHTML = options.join('');
  fillToolOptions(serverSelectEl.value);
}

function fillToolOptions(serverId) {
  const server = state.servers.find((item) => item.id === serverId);
  const options = ['<option value="">Select tool</option>'];
  if (server) {
    for (const tool of server.tools) {
      options.push(`<option value="${escapeHtml(tool)}">${escapeHtml(tool)}</option>`);
    }
  }
  toolSelectEl.innerHTML = options.join('');
}

function renderServerList() {
  if (!state.servers.length) {
    serverListEl.innerHTML = '<p class="item">No servers registered yet.</p>';
    return;
  }

  serverListEl.innerHTML = state.servers
    .map(
      (server) => `
      <article class="item">
        <div class="row">
          <h3>${escapeHtml(server.name)}</h3>
          <button type="button" class="remove" data-remove-server="${server.id}">Remove</button>
        </div>
        <p><strong>URL:</strong> ${escapeHtml(server.base_url)}</p>
        <p><strong>Tools:</strong> ${escapeHtml(server.tools.join(', '))}</p>
        <p><strong>Guideline:</strong> ${server.guideline ? 'Attached' : 'None'}</p>
      </article>
    `,
    )
    .join('');

  document.querySelectorAll('[data-remove-server]').forEach((button) => {
    button.addEventListener('click', () => {
      const serverId = button.getAttribute('data-remove-server');
      state.servers = state.servers.filter((server) => server.id !== serverId);
      state.chain = state.chain.filter((step) => step.server_id !== serverId);
      persist();
      render();
    });
  });
}

function renderCanvas() {
  chainCountEl.textContent = `${state.chain.length} ${state.chain.length === 1 ? 'step' : 'steps'}`;

  if (!state.chain.length) {
    canvasEl.innerHTML = '<p class="empty">No steps yet. Add a chain step to start drawing your flow.</p>';
    return;
  }

  const width = Math.max(1000, state.chain.length * NODE_SPACING + 120);
  const track = [`<div class="chain-track" style="width:${width}px">`, '<div class="chain-line"></div>'];

  state.chain.forEach((step, index) => {
    const server = state.servers.find((item) => item.id === step.server_id);
    const left = 16 + index * NODE_SPACING;

    track.push(`
      <article class="node" style="left:${left}px">
        <h3>${index + 1}. ${escapeHtml(step.id)}</h3>
        <p><strong>Server:</strong> ${escapeHtml(server?.name || 'missing')}</p>
        <p><strong>Tool:</strong> ${escapeHtml(step.tool_name)}</p>
        <p><strong>Input:</strong> <code>${escapeHtml(step.input_template)}</code></p>
        <div class="controls">
          <button type="button" data-move-left="${escapeHtml(step.id)}">←</button>
          <button type="button" data-move-right="${escapeHtml(step.id)}">→</button>
          <button type="button" class="remove" data-remove-step="${escapeHtml(step.id)}">Remove</button>
        </div>
      </article>
    `);

    if (index < state.chain.length - 1) {
      track.push(`<span class="arrow" style="left:${left + 215}px"></span>`);
    }
  });

  track.push('</div>');
  canvasEl.innerHTML = track.join('');

  document.querySelectorAll('[data-remove-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.getAttribute('data-remove-step');
      state.chain = state.chain.filter((step) => step.id !== stepId);
      persist();
      render();
    });
  });

  document.querySelectorAll('[data-move-left]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.getAttribute('data-move-left');
      moveStep(stepId, -1);
    });
  });

  document.querySelectorAll('[data-move-right]').forEach((button) => {
    button.addEventListener('click', () => {
      const stepId = button.getAttribute('data-move-right');
      moveStep(stepId, 1);
    });
  });
}

function moveStep(stepId, delta) {
  const index = state.chain.findIndex((step) => step.id === stepId);
  if (index < 0) return;
  const target = index + delta;
  if (target < 0 || target >= state.chain.length) return;

  const [step] = state.chain.splice(index, 1);
  state.chain.splice(target, 0, step);
  persist();
  render();
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { servers: [], chain: [] };

  try {
    const parsed = JSON.parse(raw);
    return {
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      chain: Array.isArray(parsed.chain) ? parsed.chain : [],
    };
  } catch {
    return { servers: [], chain: [] };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
