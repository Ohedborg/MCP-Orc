# MCP-Orc

Security-first composed MCP server MVP.

## Status
- ✅ Chunk 0 docs complete (`docs/*`)
- ✅ Chunk 1 scaffold + Kubernetes security baseline manifests added
- ✅ Chunk 2 orchestrator MCP server skeleton (stdio + SQLite + validation)
- ✅ Chunk 3 runner service (Go) + hardened gVisor pod launcher + runner k8s manifests
- ✅ Chunk 4 runner supply-chain controls (registry allowlist + cosign verify + digest pinning)
- ✅ Chunk 5 minimal MCP bridging path (orchestrator -> runner -> downstream tool proxy) with tool allowlist
- ✅ Chunk 6 deterministic composed workflow tool + guidance layering + artifact persistence
- ✅ Chunk 7 expanded audit trace + best-effort replay
- ✅ Frontend workflow builder with white canvas chain composition for MCP server orchestration

## Quick start
- Infra: `infra/kind/gvisor-setup.md`, `infra/k8s/README.md`
- Orchestrator: `orchestrator/README.md`
- Runner: `runner/README.md`
- Frontend: `frontend/`

## Run app + frontend on localhost
```bash
make up-local
```
This starts:
- runner on `http://127.0.0.1:8080`
- frontend on `http://127.0.0.1:4173`

## Frontend usage flow
1. Use the trigger/plus canvas to add MCP nodes in a linear workflow.
2. Configure MCP servers in a Cursor-like settings panel (toggle enabled state, save/delete servers).
3. OAuth now starts with a single "Start OAuth" action (no manual OAuth client fields).
4. Tools become selectable only after connection verification, matching MCP settings behavior.
5. Edit/import/export `mcp.json` and build a chain that passes compressed context between nodes.
