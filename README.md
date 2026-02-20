# MCP-Orc

Security-first composed MCP server MVP.

## Status
- ✅ Chunk 0 docs complete (`docs/*`)
- ✅ Chunk 1 scaffold + Kubernetes security baseline manifests added
- ✅ Chunk 2 orchestrator MCP server skeleton (stdio + SQLite + validation)
- ✅ Chunk 3 runner service (Go) + hardened gVisor pod launcher + runner k8s manifests
- ✅ Chunk 4 runner supply-chain controls (registry allowlist + cosign verify + digest pinning)

## Quick start
- Chunk 1/3/4 infra: `infra/kind/gvisor-setup.md`, `infra/k8s/README.md`
- Chunk 2 orchestrator: `orchestrator/README.md`
- Chunk 3/4 runner: `runner/README.md`
