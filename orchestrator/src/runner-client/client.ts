export interface RunnerStubResponse {
  accepted: boolean;
  detail: string;
}

export async function enqueueWorkflow(_workflowId: string, _params: Record<string, unknown>): Promise<RunnerStubResponse> {
  return {
    accepted: true,
    detail: "Runner integration is stubbed in Chunk 2.",
  };
}
