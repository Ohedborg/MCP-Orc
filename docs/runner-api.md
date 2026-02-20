# Runner API Contract (OpenAPI Sketch)

```yaml
openapi: 3.1.0
info:
  title: Composed MCP Runner API
  version: 0.1.0
servers:
  - url: http://runner.runner.svc.cluster.local
paths:
  /runs:
    post:
      summary: Create sandboxed run
      operationId: createRun
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateRunRequest'
      responses:
        '201':
          description: Run created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CreateRunResponse'
        '400': { description: Invalid request }
        '403': { description: Policy denied }
        '500': { description: Internal error }
  /runs/{run_id}:
    get:
      summary: Get run status and policy evidence
      operationId: getRun
      parameters:
        - in: path
          name: run_id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: Run state
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetRunResponse'
        '404': { description: Not found }
  /runs/{run_id}/logs:
    get:
      summary: Fetch bounded stdout/stderr logs
      operationId: getRunLogs
      parameters:
        - in: path
          name: run_id
          required: true
          schema: { type: string }
        - in: query
          name: tail_lines
          required: false
          schema: { type: integer, minimum: 1, maximum: 10000, default: 500 }
      responses:
        '200':
          description: Log payload
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/GetLogsResponse'
        '404': { description: Not found }
  /runs/{run_id}/stop:
    post:
      summary: Stop a run and cleanup pod
      operationId: stopRun
      parameters:
        - in: path
          name: run_id
          required: true
          schema: { type: string }
      responses:
        '202': { description: Stop initiated }
        '404': { description: Not found }
components:
  schemas:
    ResourceLimits:
      type: object
      required: [cpu_millis, memory_mb, timeout_seconds]
      properties:
        cpu_millis: { type: integer, minimum: 50, maximum: 8000 }
        memory_mb: { type: integer, minimum: 64, maximum: 16384 }
        timeout_seconds: { type: integer, minimum: 1, maximum: 3600 }
    CreateRunRequest:
      type: object
      required:
        - image_ref
        - resources
        - network_policy_profile
      properties:
        image_ref:
          type: string
          description: Input image reference (tag or digest); runner resolves to digest.
        command:
          type: array
          items: { type: string }
        args:
          type: array
          items: { type: string }
        env_allowlist:
          type: object
          additionalProperties: { type: string }
          description: Explicit non-secret env vars allowed into pod.
        resources:
          $ref: '#/components/schemas/ResourceLimits'
        network_policy_profile:
          type: string
          enum: [deny-all, dns-only]
        workflow_context:
          type: object
          additionalProperties: true
    PolicyEvidence:
      type: object
      required: [registry_allowed, signature_verified, resolved_digest]
      properties:
        registry_allowed: { type: boolean }
        signature_verified: { type: boolean }
        verifier: { type: string, example: cosign }
        identity: { type: string, nullable: true }
        resolved_digest: { type: string, pattern: '^sha256:[a-f0-9]{64}$' }
        denial_reason: { type: string, nullable: true }
    CreateRunResponse:
      type: object
      required: [run_id, pod_name, status, image_digest, policy_evidence]
      properties:
        run_id: { type: string }
        pod_name: { type: string }
        status: { type: string, enum: [queued, starting, running, failed] }
        image_digest: { type: string, pattern: '^sha256:[a-f0-9]{64}$' }
        policy_evidence:
          $ref: '#/components/schemas/PolicyEvidence'
    GetRunResponse:
      type: object
      required: [run_id, status, pod_name, started_at, policy_evidence]
      properties:
        run_id: { type: string }
        status: { type: string, enum: [queued, starting, running, succeeded, failed, timed_out, stopped] }
        pod_name: { type: string }
        started_at: { type: string, format: date-time, nullable: true }
        finished_at: { type: string, format: date-time, nullable: true }
        exit_code: { type: integer, nullable: true }
        reason: { type: string, nullable: true }
        policy_evidence:
          $ref: '#/components/schemas/PolicyEvidence'
    GetLogsResponse:
      type: object
      required: [run_id, stdout, stderr, truncated]
      properties:
        run_id: { type: string }
        stdout: { type: string }
        stderr: { type: string }
        truncated: { type: boolean }
```

## Contract Notes
- Runner is internal-only; caller authn/authz can be layered via mTLS/service account policy in later chunk.
- Unknown network profiles must be rejected (fail-closed).
- `env_allowlist` is explicitly non-secret; secret injection is out of MVP.
