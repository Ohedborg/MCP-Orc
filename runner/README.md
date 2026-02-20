# Runner (Chunk 5)

Go internal service to launch untrusted MCP server containers into hardened Kubernetes pods.

## Implemented endpoints
- `POST /runs`
- `GET /runs/{run_id}`
- `GET /runs/{run_id}/logs`
- `POST /runs/{run_id}/stop`
- `POST /runs/{run_id}/tools/{tool_name}` (tool-proxy bridge with per-run allowlist)

## Security controls enforced
### Supply chain gate (pre-launch)
- Registry allowlist enforcement (`RUNNER_ALLOWLISTED_REGISTRIES`)
- Cosign verification before pod creation (fail-closed)
- Digest resolution from Cosign output
- Pod image pinning to immutable `@sha256:...` digest

### Tool scoping
- `allowed_tools` allowlist accepted at run creation.
- Proxy invocation is denied (`403`) when tool is not in allowlist.

### Pod hardening
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
