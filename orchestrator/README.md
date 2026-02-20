# Orchestrator (Chunk 2 skeleton)

TypeScript/Node MCP server using the official MCP TypeScript SDK with stdio transport.

## Implemented
- MCP tools:
  - `run_workflow` -> `{ run_id, status }`
  - `get_run_trace` -> redacted trace by `run_id`
- Zod validation for tool input/output schemas
- Structured JSON logging with request IDs
- SQLite persistence (`better-sqlite3`) with tables:
  - `runs`
  - `steps`
  - `tool_calls`
- Runner integration stub (`enqueueWorkflow`)

## Run locally
```bash
cd orchestrator
npm install
npm run build
npm start
```

## Dev mode
```bash
cd orchestrator
npm install
npm run dev
```

## Test
```bash
cd orchestrator
npm install
npm run test:dev
```

DB path defaults to `./orchestrator.sqlite` and can be overridden with `ORCHESTRATOR_DB_PATH`.
