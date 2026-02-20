# Runner (Chunk 3)

Go internal service to launch untrusted MCP server containers into hardened Kubernetes pods.

## Implemented endpoints
- `POST /runs`
- `GET /runs/{run_id}`
- `GET /runs/{run_id}/logs`
- `POST /runs/{run_id}/stop`

## Security controls enforced in pod spec
- `runtimeClassName: gvisor` (configurable, default `gvisor`)
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- `runAsNonRoot: true`
- drop all capabilities
- seccomp `RuntimeDefault`
- no hostPath mounts
- service account token automount disabled
- `activeDeadlineSeconds` from timeout
- CPU/memory requests+limits required (defaults if omitted)

## Run locally (needs kubeconfig)
```bash
cd runner
go mod tidy
go run ./cmd/runner
```

## Environment variables
- `RUNNER_ADDR` (default `:8080`)
- `RUNNER_NAMESPACE` (default `mcp-runs`)
- `RUNNER_RUNTIMECLASS` (default `gvisor`)
- `RUNNER_IMAGE_PULL_POLICY` (default `IfNotPresent`)
- `RUNNER_DEFAULT_CPU` (default `100m`)
- `RUNNER_DEFAULT_MEMORY` (default `128Mi`)
- `RUNNER_DEFAULT_TIMEOUT_SECONDS` (default `300`)
- `RUNNER_CLEANUP_SECONDS` (default `120`)
