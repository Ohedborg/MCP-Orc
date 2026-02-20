# Orchestrator (Chunk 5 skeleton)

TypeScript/Node MCP server using MCP TS SDK with stdio transport.

## Implemented
- MCP tools:
  - `run_workflow`
  - `get_run_trace`
- `run_workflow` now performs a minimal bridged execution flow:
  1. Validate params for a single-step tool call.
  2. Create a runner sandbox run.
  3. Invoke one downstream tool through runner proxy.
  4. Persist redacted trace data.
- Zod validation for tool schemas.
- Structured JSON logging with request IDs.
- SQLite persistence for `runs`, `steps`, `tool_calls`.

## Bridge params expected in `run_workflow.params`
- `image_ref`
- `allowed_tools` (array)
- `tool_name`
- `tool_input` (object)
- optional `command`, `args`, `cpu`, `memory`, `timeout_seconds`, `network_policy_profile`, `downstream_port`

## Run locally
```bash
cd orchestrator
npm install
npm run build
npm start
```

Set `RUNNER_BASE_URL` to point at runner (default: `http://127.0.0.1:8080`).
