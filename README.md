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
- ✅ Local frontend console for runner + one-command local startup

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
