import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

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
  if (auth.type === 'api_key' && auth.details?.api_key) {
    return { 'x-api-key': auth.details.api_key };
  }
  if (auth.type === 'bearer' && auth.details?.token) {
    return { authorization: `Bearer ${auth.details.token}` };
  }
  return {};
}

function normalizeTools(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((t) => typeof t === 'string');
  if (Array.isArray(payload.tools)) return payload.tools.map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
  if (Array.isArray(payload.result?.tools)) return payload.result.tools.map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean);
  if (payload.capabilities?.tools && typeof payload.capabilities.tools === 'object') {
    return Object.keys(payload.capabilities.tools);
  }
  return [];
}

async function discoverTools(serverUrl, auth) {
  const headers = { accept: 'application/json', ...authHeaders(auth) };

  const attempts = [
    { method: 'GET', url: serverUrl.replace(/\/$/, '') + '/tools' },
    { method: 'GET', url: serverUrl.replace(/\/$/, '') + '/mcp/tools' },
    {
      method: 'POST',
      url: serverUrl,
      body: JSON.stringify({ jsonrpc: '2.0', id: 'tools-1', method: 'tools/list', params: {} }),
      headers: { ...headers, 'content-type': 'application/json' },
    },
  ];

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        method: attempt.method,
        headers: attempt.headers || headers,
        body: attempt.body,
      });

      if (!response.ok) continue;
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      const tools = normalizeTools(payload);
      if (tools.length) return { ok: true, tools };
    } catch {
      // try next
    }
  }

  return { ok: false, error: 'Could not reach MCP tools endpoint or parse tool list.', tools: [] };
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  if (url === '/mcp/discover' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      const { server_url: serverUrl, auth } = body;

      if (!serverUrl || typeof serverUrl !== 'string') {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'server_url is required' }));
        return;
      }

      const result = await discoverTools(serverUrl, auth);
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
