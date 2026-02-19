# Runner (Chunk 1 scaffold)

Go internal service scaffold for launching sandboxed Kubernetes run pods.

- `cmd/runner`: service entrypoint
- `internal/api`: runner HTTP handlers
- `internal/k8s`: Kubernetes orchestration layer
- `internal/policy`: registry/signature policy checks
- `internal/runs`: run lifecycle state
- `internal/audit`: policy evidence persistence model
