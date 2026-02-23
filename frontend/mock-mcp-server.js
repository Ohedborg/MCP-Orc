let buffer = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;

    const header = buffer.slice(0, headerEnd).toString('utf8');
    const lenLine = header
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-length:'));

    if (!lenLine) {
      buffer = Buffer.alloc(0);
      return;
    }

    const length = Number(lenLine.split(':')[1]?.trim() || 0);
    const total = headerEnd + 4 + length;
    if (buffer.length < total) return;

    const body = buffer.slice(headerEnd + 4, total).toString('utf8');
    buffer = buffer.slice(total);

    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      continue;
    }

    if (msg.method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-local-mcp', version: '1.0.0' },
        },
      });
      continue;
    }

    if (msg.method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            { name: 'mock.search', description: 'Search mock resources' },
            { name: 'mock.read', description: 'Read mock resource by id' },
            { name: 'mock.summarize', description: 'Summarize mock context' },
          ],
        },
      });
      continue;
    }

    if (msg.id) {
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
    }
  }
});
