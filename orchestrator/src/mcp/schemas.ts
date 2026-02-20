import { z } from "zod";

export const RunWorkflowInputSchema = z.object({
  workflow_id: z.string().min(1),
  params: z.record(z.unknown()),
});

export const RunWorkflowOutputSchema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed"]),
});

export const GetRunTraceInputSchema = z.object({
  run_id: z.string().uuid(),
});

export const RunTraceSchema = z.object({
  run_id: z.string().uuid(),
  workflow_id: z.string(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error: z.string().nullable(),
  steps: z.array(z.record(z.unknown())),
  tool_calls: z.array(z.record(z.unknown())),
});
