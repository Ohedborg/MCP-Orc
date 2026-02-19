# Composed MCP Server MVP Architecture (Chunk 0)

## High-Level Components
- **Upstream MCP Client** (IDE/Loveable/etc.)
- **Orchestrator MCP Server (TypeScript/Node)**
  - exposes high-level tools (`run_workflow`, `get_run_trace`)
  - validates schemas, stores run/trace metadata
- **Runner Service (Go, internal HTTP)**
  - enforces image/security policy
  - launches sandboxed run pods in Kubernetes
- **Kubernetes Cluster**
  - run namespace for untrusted pods
  - gVisor RuntimeClass for isolation
  - deny-by-default egress network policy
- **Persistence**
  - SQLite (MVP) for orchestrator metadata/audit records
  - filesystem/PVC for artifacts (MVP)

## Sequence Diagram
```mermaid
sequenceDiagram
    participant C as Upstream MCP Client
    participant O as Orchestrator MCP Server
    participant R as Runner Service (internal)
    participant K as Kubernetes API
    participant P as Untrusted MCP Pod (gVisor)

    C->>O: MCP tool call: run_workflow(workflow_id, params)
    O->>O: Validate input + persist run(status=queued)
    O->>R: POST /runs (image_ref, limits, policy profile)
    R->>R: Verify registry allowlist + cosign + resolve digest
    alt policy check fails
      R-->>O: reject (reason)
      O-->>C: run failed (policy)
    else policy check passes
      R->>K: Create Pod(runtimeClass=gvisor, hardened securityContext)
      K-->>R: Pod admitted
      R-->>O: run_id, pod_name, image_digest
      O->>R: poll GET /runs/{id}
      R->>K: Read pod phase/logs
      K-->>R: status/logs
      R-->>O: status + evidence
      O->>O: Persist tool I/O + decisions (redacted)
      O-->>C: run status/result trace
    end
```

## Trust Boundary Narrative
- **Trusted:** orchestrator, runner, cluster control-plane, policy config.
- **Untrusted:** downstream MCP server image, process, outputs, and artifacts until validated.
- **Controlled interface:** runner HTTP contract is the only path to launch execution.

## Security-by-Design Decisions
1. **Isolation-first:** untrusted code never runs in orchestrator/runner process space.
2. **Policy gate before execution:** signature + registry + digest checks happen before pod creation.
3. **Network minimization:** deny all egress unless explicitly required.
4. **Deterministic orchestration:** upstream tools remain stable while internal steps are controlled and audited.

## Deployment Model (MVP)
- Single Kubernetes cluster.
- Internal-only runner service (`ClusterIP`), no public ingress.
- Orchestrator can run in-cluster or local-dev with controlled access to runner.
