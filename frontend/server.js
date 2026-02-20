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

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

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
