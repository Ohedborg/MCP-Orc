# MVP Security Goals (Verifiable)

Each goal is phrased as a testable statement that must be demonstrable in later chunks.

## G1 — Untrusted execution isolation
**Goal:** Every downstream MCP server execution runs in a pod with `runtimeClassName: gvisor` (or `runsc` equivalent).
**Verification target:** `kubectl get/describe pod` shows runtime class; runner rejects launches if runtime class cannot be applied.

## G2 — Deny-by-default egress
**Goal:** Untrusted run namespace denies all egress by default.
**Verification target:** test pod fails outbound network to internet/internal services unless explicitly allowlisted.

## G3 — Signed images from allowlisted registries only
**Goal:** Runner accepts only images from configured allowlisted registries/namespaces and with valid Cosign verification against configured identities/keys.
**Verification target:** negative tests for non-allowlisted and unsigned images fail closed.

## G4 — Digest pinning
**Goal:** Pod image references are immutable digests, never mutable tags, at execution time.
**Verification target:** runner resolves image digest prior to launch and persists digest in run record.

## G5 — Restrictive pod security context
**Goal:** Run pods enforce:
- `readOnlyRootFilesystem: true`
- `allowPrivilegeEscalation: false`
- `runAsNonRoot: true`
- all Linux capabilities dropped
- `seccompProfile: RuntimeDefault`
- no hostPath volumes
**Verification target:** pod spec inspection and conformance tests.

## G6 — Strict resource/time bounds
**Goal:** Every run has bounded CPU, memory, and timeout.
**Verification target:** pod resource limits present; `activeDeadlineSeconds` configured; timeout causes termination.

## G7 — Full auditability
**Goal:** System stores an audit trail containing:
- tool calls (redacted)
- policy decisions
- image verification evidence + final digest
- applied network profile
- run timestamps/status
**Verification target:** `get_run_trace`/runner status endpoints return this evidence for each run.

## G8 — Fail-closed policy behavior
**Goal:** If policy verification is unavailable/ambiguous (signature check error, registry parse failure, missing profile), execution is denied.
**Verification target:** induced policy subsystem failures result in explicit rejection, not fallback execution.

## G9 — No secret leakage to untrusted workloads
**Goal:** Untrusted pods do not receive long-lived credentials by default.
**Verification target:** runner omits secret mounts/env unless explicitly future-approved (post-MVP capability).
