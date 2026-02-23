#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_PORT="${FRONTEND_PORT:-4173}"
FRONTEND_HOST="${FRONTEND_HOST:-127.0.0.1}"

cleanup() {
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "[1/5] Starting frontend server"
(
  cd "$ROOT_DIR/frontend"
  FRONTEND_HOST="$FRONTEND_HOST" FRONTEND_PORT="$FRONTEND_PORT" npm start
) >/tmp/mcp-orc-frontend.log 2>&1 &
FRONTEND_PID=$!

for _ in {1..30}; do
  if curl -fsS "http://${FRONTEND_HOST}:${FRONTEND_PORT}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS "http://${FRONTEND_HOST}:${FRONTEND_PORT}/" >/dev/null 2>&1; then
  echo "Frontend failed to start. Logs:"
  cat /tmp/mcp-orc-frontend.log
  exit 1
fi

echo "[2/5] Checking diagnostics endpoint"
python - <<'PY'
from urllib import request
import json
url = 'http://127.0.0.1:4173/mcp/diagnostics'
with request.urlopen(url, timeout=10) as resp:
    body = json.loads(resp.read().decode())
assert 'internet' in body, 'missing internet diagnostics field'
print('diagnostics ok')
PY

echo "[3/5] Verifying HTTP MCP discovery lifecycle"
python - <<'PY'
import json, threading, time
from urllib import request
from http.server import BaseHTTPRequestHandler, HTTPServer

class H(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('content-length', '0'))
        payload = json.loads(self.rfile.read(length).decode() or '{}')
        if payload.get('method') == 'tools/list':
            body = {'jsonrpc': '2.0', 'id': payload.get('id'), 'result': {'tools': [{'name':'http.search'}, {'name':'http.read'}]}}
        else:
            body = {'jsonrpc': '2.0', 'id': payload.get('id'), 'result': {'capabilities': {'tools': {}}}}
        self.send_response(200)
        self.send_header('content-type','application/json')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
    def log_message(self, *_):
        return

srv = HTTPServer(('127.0.0.1', 18991), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.2)

req = request.Request(
    'http://127.0.0.1:4173/mcp/discover',
    data=json.dumps({'url':'http://127.0.0.1:18991/mcp', 'auth': {'type':'none', 'details':{}}}).encode(),
    headers={'content-type':'application/json'},
    method='POST',
)
with request.urlopen(req, timeout=10) as resp:
    body = json.loads(resp.read().decode())
assert body.get('ok') is True, body
assert 'http.search' in body.get('tools', []), body
srv.shutdown()
print('http discovery ok')
PY

echo "[4/5] Verifying stdio MCP discovery lifecycle"
cat > /tmp/mcp-orc-stdio-check.js <<'JS'
let buffer = Buffer.alloc(0);
function send(msg){
  const body = Buffer.from(JSON.stringify(msg));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const idx = buffer.indexOf('\r\n\r\n');
    if (idx < 0) return;
    const header = buffer.slice(0, idx).toString('utf8');
    const lenLine = header.split('\r\n').find((l) => l.toLowerCase().startsWith('content-length:'));
    if (!lenLine) return;
    const len = Number(lenLine.split(':')[1].trim());
    const total = idx + 4 + len;
    if (buffer.length < total) return;
    const body = JSON.parse(buffer.slice(idx + 4, total).toString('utf8'));
    buffer = buffer.slice(total);
    if (body.method === 'initialize') {
      send({ jsonrpc: '2.0', id: body.id, result: { capabilities: { tools: {} } } });
    } else if (body.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'stdio.search' }, { name: 'stdio.read' }] } });
    }
  }
});
JS

python - <<'PY'
from urllib import request
import json
req = request.Request(
    'http://127.0.0.1:4173/mcp/discover',
    data=json.dumps({'command':'node', 'args':['/tmp/mcp-orc-stdio-check.js'], 'env': {}}).encode(),
    headers={'content-type':'application/json'},
    method='POST',
)
with request.urlopen(req, timeout=15) as resp:
    body = json.loads(resp.read().decode())
assert body.get('ok') is True, body
assert 'stdio.search' in body.get('tools', []), body
print('stdio discovery ok')
PY

echo "[5/5] Client validation passed"
