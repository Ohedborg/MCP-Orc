# Orchestrator (Chunk 7)

TypeScript/Node MCP server using MCP TS SDK with stdio transport.

## Implemented tools
- `run_workflow` (single-step bridge)
- `build_component_workflow` (deterministic multi-step composed workflow)
- `replay_run` (best-effort replay)
- `get_run_trace`

## Chunk 7 additions
- Extended run audit trail in DB (`run_audit`) including:
  - workflow hash
  - workflow input snapshot (redacted)
  - step execution evidence (image digest + policy evidence)
  - replay lineage (`replay_of`)
- `get_run_trace` now returns audit records alongside steps/tool calls/artifacts.
- `replay_run` re-executes supported workflows (`build_component_workflow`) using stored prior inputs and pinned execution controls from workflow definitions.

## Run locally
```bash
cd orchestrator
npm install
npm run build
npm start
```

Set `RUNNER_BASE_URL` to point at runner (default: `http://127.0.0.1:8080`).
