# Orchestrator (Chunk 6)

TypeScript/Node MCP server using MCP TS SDK with stdio transport.

## Implemented tools
- `run_workflow` (single-step bridge)
- `build_component_workflow` (deterministic multi-step composed workflow)
- `get_run_trace`

## Chunk 6 additions
- Workflow spec file support (JSON) with linear `steps`.
- Guidance layering:
  - global guidance file
  - per-step guidance file
- Artifact passing between steps via templated inputs (`{{artifact_name}}`).
- Prompt-injection hardening:
  - reject command-like fields in step tool inputs
  - never execute commands from tool output
  - schema-validate downstream output before artifact use
- Artifacts persisted in SQLite (`artifacts` table) and included in `get_run_trace`.

## Sample workflow
- `workflows/sample/build_component_workflow.json`
- guidance files under `workflows/sample/guidance/`

## Run locally
```bash
cd orchestrator
npm install
npm run build
npm start
```

Set `RUNNER_BASE_URL` to point at runner (default: `http://127.0.0.1:8080`).
