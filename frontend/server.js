import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const host = process.env.FRONTEND_HOST || '127.0.0.1';
const port = Number(process.env.FRONTEND_PORT || '4173');
const runnerBase = process.env.RUNNER_BASE_URL || 'http://127.0.0.1:8080';

const root = path.resolve(process.cwd());

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType });
    res.end(data);
  });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf-8') || '{}';
  return JSON.parse(body);
}

function authHeaders(auth = { type: 'none', details: {} }) {
  if (auth?.type === 'api_key' && auth.details?.api_key) {
    return { 'x-api-key': auth.details.api_key };
  }
  if (auth?.type === 'bearer' && auth.details?.token) {
    return { authorization: `Bearer ${auth.details.token}` };
  }
  return {};
}

function normalizeTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((t) => typeof t === 'string');

  const tools = payload.tools || payload.result?.tools;
  if (Array.isArray(tools)) {
    return tools
      .map((tool) => {
        if (typeof tool === 'string') return tool;
        if (typeof tool?.name === 'string') return tool.name;
        return null;
      })
      .filter(Boolean);
  }

  if (payload.capabilities?.tools && typeof payload.capabilities.tools === 'object') {
    return Object.keys(payload.capabilities.tools);
  }

  return [];
}

async function discoverToolsViaHttp(serverUrl, auth) {
  const headers = { accept: 'application/json', ...authHeaders(auth) };
  const base = serverUrl.replace(/\/$/, '');

  const attempts = [
    { method: 'GET', url: `${base}/tools`, headers },
    { method: 'GET', url: `${base}/mcp/tools`, headers },
    {
      method: 'POST',
      url: base,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'initialize-1',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-orc-frontend', version: '0.1.0' },
        },
      }),
    },
    {
      method: 'POST',
      url: base,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'tools-1', method: 'tools/list', params: {} }),
    },
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: attempt.headers,
        body: attempt.body,
      });
      if (!response.ok) continue;

      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      const tools = normalizeTools(payload);
      if (tools.length) return { ok: true, tools, transport: 'http' };
    } catch {
      // continue trying other endpoints
    }
  }

  return {
    ok: false,
    error: 'HTTP discovery failed. Ensure MCP server supports HTTP transport and tools/list.',
    tools: [],
    transport: 'http',
  };
}

function encodeRpcMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
  return Buffer.concat([header, body]);
}

function createRpcReader(stream, onMessage) {
  let buffer = Buffer.alloc(0);

  stream.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;

      const headerText = buffer.slice(0, headerEnd).toString('utf8');
      const contentLengthLine = headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'));

      if (!contentLengthLine) {
        buffer = Buffer.alloc(0);
        return;
      }

      const length = Number(contentLengthLine.split(':')[1]?.trim() || 0);
      const totalSize = headerEnd + 4 + length;
      if (buffer.length < totalSize) return;

      const jsonBody = buffer.slice(headerEnd + 4, totalSize).toString('utf8');
      buffer = buffer.slice(totalSize);

      try {
        onMessage(JSON.parse(jsonBody));
      } catch {
        // ignore malformed message and continue
      }
    }
  });
}

async function discoverToolsViaStdio(commandConfig) {
  const command = commandConfig.command;
  const args = Array.isArray(commandConfig.args) ? commandConfig.args : [];
  const env = {
    ...process.env,
    ...(commandConfig.env && typeof commandConfig.env === 'object' ? commandConfig.env : {}),
  };

  if (!command) {
    return { ok: false, tools: [], error: 'Missing command for stdio MCP server.', transport: 'stdio' };
  }

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env,
      cwd: process.cwd(),
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ ok: false, tools: [], error: 'Timeout talking to stdio MCP server.', transport: 'stdio' });
    }, 12000);

    let stderrOutput = '';
    proc.stderr.on('data', (chunk) => {
      stderrOutput += chunk.toString('utf8');
    });

    const pending = new Map();
    createRpcReader(proc.stdout, (message) => {
      if (message.id && pending.has(message.id)) {
        const done = pending.get(message.id);
        pending.delete(message.id);
        done(message);
      }
    });

    const sendRpc = (message) => {
      proc.stdin.write(encodeRpcMessage(message));
    };

    const requestRpc = (id, method, params = {}) =>
      new Promise((done) => {
        pending.set(id, done);
        sendRpc({ jsonrpc: '2.0', id, method, params });
      });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, tools: [], error: `Failed to start stdio MCP: ${error.message}`, transport: 'stdio' });
    });

    (async () => {
      try {
        const init = await requestRpc('init-1', 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'mcp-orc-frontend', version: '0.1.0' },
        });

        if (init.error) {
          proc.kill('SIGKILL');
          clearTimeout(timeout);
          resolve({ ok: false, tools: [], error: `Initialize failed: ${init.error.message || 'unknown error'}`, transport: 'stdio' });
          return;
        }

        sendRpc({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
        const toolsResp = await requestRpc('tools-1', 'tools/list', {});
        const tools = normalizeTools(toolsResp);

        proc.kill('SIGKILL');
        clearTimeout(timeout);

        if (!tools.length) {
          resolve({ ok: false, tools: [], error: stderrOutput || 'No tools returned from stdio MCP server.', transport: 'stdio' });
          return;
        }

        resolve({ ok: true, tools, transport: 'stdio' });
      } catch (error) {
        proc.kill('SIGKILL');
        clearTimeout(timeout);
        resolve({ ok: false, tools: [], error: String(error.message || error), transport: 'stdio' });
      }
    })();
  });
}

async function discoverTools(config) {
  if (config.url) {
    return discoverToolsViaHttp(config.url, config.auth);
  }

  if (config.command) {
    return discoverToolsViaStdio(config);
  }

  return { ok: false, tools: [], error: 'Server needs either url or command.', transport: 'unknown' };
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url === '/mcp/discover' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const result = await discoverTools(body || {});
      res.writeHead(result.ok ? 200 : 502, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(error.message || error), tools: [] }));
      return;
    }
  }

  if (url.startsWith('/api/')) {
    const upstream = new URL(url.replace('/api', ''), runnerBase);
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const proxied = await fetch(upstream, {
      method: req.method,
      headers: { 'content-type': req.headers['content-type'] || 'application/json' },
      body: body.length ? body : undefined,
    });

    const text = await proxied.text();
    res.writeHead(proxied.status, { 'content-type': proxied.headers.get('content-type') || 'application/json' });
    res.end(text);
    return;
  }

  if (url === '/' || url === '/index.html') return sendFile(res, path.join(root, 'index.html'), 'text/html; charset=utf-8');
  if (url === '/app.js') return sendFile(res, path.join(root, 'app.js'), 'application/javascript; charset=utf-8');
  if (url === '/styles.css') return sendFile(res, path.join(root, 'styles.css'), 'text/css; charset=utf-8');

  res.writeHead(404);
  res.end('not found');
});

server.listen(port, host, () => {
  console.log(`frontend running at http://${host}:${port}`);
  console.log(`proxying /api -> ${runnerBase}`);
});
