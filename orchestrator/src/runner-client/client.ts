export interface RunnerCreateRunRequest {
  image_ref: string;
  command?: string[];
  args?: string[];
  env_allowlist?: Record<string, string>;
  allowed_tools?: string[];
  downstream_port?: number;
  cpu?: string;
  memory?: string;
  timeout_seconds?: number;
  network_policy_profile: "deny-all" | "dns-only";
}

export interface RunnerCreateRunResponse {
  run_id: string;
  pod_name: string;
  image_digest: string;
  policy_evidence: {
    registry_allowed: boolean;
    signature_verified: boolean;
    verifier: string;
    identity?: string;
    resolved_digest: string;
    denial_reason?: string;
  };
}

export interface RunnerInvokeToolResponse {
  run_id: string;
  tool_name: string;
  output: Record<string, unknown>;
  raw_status: number;
}

const baseUrl = process.env.RUNNER_BASE_URL ?? "http://127.0.0.1:8080";

export async function createRun(req: RunnerCreateRunRequest): Promise<RunnerCreateRunResponse> {
  const res = await fetch(`${baseUrl}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`runner create failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunnerCreateRunResponse;
}

export async function invokeTool(runId: string, toolName: string, input: Record<string, unknown>): Promise<RunnerInvokeToolResponse> {
  const res = await fetch(`${baseUrl}/runs/${runId}/tools/${toolName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`runner invoke failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RunnerInvokeToolResponse;
}
