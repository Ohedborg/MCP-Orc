# Composed MCP Server MVP Threat Model (Chunk 0)

## Scope
This threat model covers the MVP architecture where:
- An upstream MCP client calls a trusted **Orchestrator MCP Server**.
- The orchestrator delegates untrusted execution requests to a trusted **Runner** service.
- Runner launches untrusted downstream MCP servers as isolated Kubernetes pods.

Assumption: **All downstream servers and their outputs are potentially malicious.**

## Assets to Protect
- Orchestrator control plane integrity and availability.
- Runner policy enforcement integrity.
- Kubernetes cluster control plane and node security.
- Workflow data, intermediate artifacts, and traces.
- Audit logs and policy decision records.
- Registry trust policy and image verification metadata.

## Trust Boundaries
1. **Boundary A:** Upstream MCP client -> Orchestrator (semi-trusted external caller).
2. **Boundary B:** Orchestrator -> Runner (trusted internal control channel).
3. **Boundary C:** Runner -> Kubernetes API (privileged orchestration boundary).
4. **Boundary D:** Runner/Orchestrator -> Untrusted downstream MCP pod (hostile execution boundary).
5. **Boundary E:** Cluster -> External network/registries (egress-controlled boundary).

## Adversaries
- Malicious user-supplied MCP server image author.
- Supply-chain attacker tampering with image tags/registries.
- Tenant attempting lateral movement or privilege escalation.
- Prompt-injection attacker via downstream tool outputs.
- Resource-abuse actor attempting DoS.

## Primary Threats and Mitigations

### 1) Malicious server behavior in downstream pod
**Threats:** arbitrary code execution, filesystem probing, process abuse.
**MVP mitigations:**
- gVisor RuntimeClass for strong workload isolation.
- Pod securityContext hardening: non-root, no privilege escalation, drop all caps, read-only root FS, seccomp runtime default.
- No hostPath mounts; only controlled ephemeral storage where required.

### 2) Data exfiltration / SSRF / callback channels
**Threats:** outbound internet calls, metadata service access, DNS tunneling.
**MVP mitigations:**
- Namespace-level deny-by-default egress NetworkPolicy.
- Minimal explicit egress allowlist (only required endpoints, e.g., kube-dns if needed).
- No direct secret injection into untrusted pods.

### 3) Prompt injection via downstream tool outputs
**Threats:** orchestrator executes attacker instructions embedded in outputs.
**MVP mitigations:**
- Treat all downstream outputs as untrusted data.
- Strict schema validation and redaction before reuse.
- Deterministic workflow engine that never executes free-form commands from tool output.
- Tool allowlisting per workflow step.

### 4) Supply-chain tampering
**Threats:** malicious images from untrusted registries, signature stripping, mutable tags.
**MVP mitigations:**
- Registry allowlist enforcement in Runner.
- Cosign signature verification against configured trust identities/keys before execution.
- Resolve and pin images to immutable digests for pod launch.

### 5) Privilege escalation and lateral movement
**Threats:** escaping sandbox, abusing service account, reaching internal services.
**MVP mitigations:**
- Runtime isolation with gVisor.
- Least-privilege service accounts and RBAC for runner/orchestrator.
- No privileged pods, no host networking, no host PID/IPC.
- NetworkPolicy blocks east-west by default.

### 6) Resource abuse / DoS
**Threats:** CPU/memory exhaustion, hung workloads, log flooding.
**MVP mitigations:**
- Strict CPU/memory requests+limits.
- activeDeadlineSeconds / timeout enforced by runner.
- Max log size/collection limits and bounded retries.

### 7) Audit tampering / non-repudiation gaps
**Threats:** inability to prove what ran under which policy.
**MVP mitigations:**
- Persist run metadata: policy decisions, image digest, workflow hash, timestamps.
- Persist redacted tool I/O and runner decisions.
- Correlate logs via request/run IDs.

## Residual Risks (MVP)
- DNS-only egress exceptions may still allow limited covert channels unless tightly constrained by CNI capabilities.
- Single-instance metadata store (SQLite) may be a reliability bottleneck.
- Third-party image vulnerabilities remain possible even when signatures are valid; vulnerability scanning is out of MVP scope.

## Out of Scope for Chunk 0
- Multi-tenant quota/billing controls.
- Secrets broker with short-lived dynamic credentials.
- Full policy engine (OPA/Kyverno) integration.
