import { z } from "zod";

export const StepBridgeParamsSchema = z.object({
  image_ref: z.string().min(1),
  allowed_tools: z.array(z.string().min(1)).min(1),
  tool_name: z.string().min(1),
  tool_input: z.record(z.unknown()).default({}),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  cpu: z.string().optional(),
  memory: z.string().optional(),
  timeout_seconds: z.number().int().positive().max(3600).optional(),
  network_policy_profile: z.enum(["deny-all", "dns-only"]).default("deny-all"),
  downstream_port: z.number().int().positive().max(65535).default(8080),
});

export const BuildComponentWorkflowInputSchema = z.object({
  component_name: z.string().min(1),
});

export const BuildComponentWorkflowOutputSchema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["queued", "running", "completed", "failed"]),
  final_output: z.record(z.unknown()).optional(),
});

export const ReplayRunInputSchema = z.object({
  run_id: z.string().uuid(),
});

export const ReplayRunOutputSchema = z.object({
  source_run_id: z.string().uuid(),
  replay_run_id: z.string().uuid(),
  status: z.enum(["completed", "failed"]),
});

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
  artifacts: z.array(z.record(z.unknown())).optional(),
  audit: z.array(z.record(z.unknown())).optional(),
});
