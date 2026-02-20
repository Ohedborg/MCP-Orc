import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Repository } from "../db/repository.js";
import { createRun, invokeTool } from "../runner-client/client.js";
import { redactSensitive } from "../security/redaction.js";

const StepSchema = z.object({
  id: z.string().min(1),
  image_ref: z.string().min(1),
  allowed_tools: z.array(z.string().min(1)).min(1),
  tool_name: z.string().min(1),
  guidance_file: z.string().min(1),
  inputs: z.record(z.unknown()).default({}),
  outputs: z.array(z.string().min(1)).default([]),
});

const WorkflowSchema = z.object({
  workflow_id: z.string().min(1),
  global_guidance: z.string().min(1),
  steps: z.array(StepSchema).min(1),
});

export interface WorkflowExecutionResult {
  workflow_hash: string;
  artifacts: Record<string, unknown>;
  final_output: Record<string, unknown>;
}

export async function executeWorkflowFile(
  repository: Repository,
  runId: string,
  workflowFile: string,
  initialInputs: Record<string, unknown>,
): Promise<WorkflowExecutionResult> {
  const raw = fs.readFileSync(workflowFile, "utf-8");
  const workflowHash = createHash("sha256").update(raw).digest("hex");
  const workflow = WorkflowSchema.parse(JSON.parse(raw));
  const workflowDir = path.dirname(workflowFile);
  const globalGuidance = fs.readFileSync(path.join(workflowDir, workflow.global_guidance), "utf-8");

  repository.insertAudit(runId, "workflow_hash", JSON.stringify({ workflow_hash: workflowHash }));
  repository.insertAudit(runId, "workflow_input", JSON.stringify(redactSensitive(initialInputs)));

  const artifacts: Record<string, unknown> = { ...initialInputs };

  for (const step of workflow.steps) {
    const stepGuidance = fs.readFileSync(path.join(workflowDir, step.guidance_file), "utf-8");
    const renderedInputs = renderTemplate(step.inputs, artifacts);
    const safeInputs = rejectCommandLikeFields(renderedInputs);

    repository.insertStep(runId, step.id, "running");
    repository.insertArtifact(runId, step.id, "guidance_context", JSON.stringify(redactSensitive({ globalGuidance, stepGuidance })));

    const run = await createRun({
      image_ref: step.image_ref,
      allowed_tools: step.allowed_tools,
      network_policy_profile: "deny-all",
    });

    repository.insertAudit(
      runId,
      "step_execution",
      JSON.stringify(
        redactSensitive({
          step_id: step.id,
          image_digest: run.image_digest,
          policy_evidence: run.policy_evidence,
        }),
      ),
    );

    const response = await invokeTool(run.run_id, step.tool_name, safeInputs);
    const safeOutput = OutputSchema.parse(response.output);

    repository.insertToolCall({
      run_id: runId,
      step_id: step.id,
      tool_name: step.tool_name,
      input_redacted: JSON.stringify(redactSensitive(safeInputs)),
      output_redacted: JSON.stringify(redactSensitive(safeOutput)),
      created_at: new Date().toISOString(),
    });

    for (const key of step.outputs) {
      artifacts[key] = safeOutput[key];
      repository.insertArtifact(runId, step.id, key, JSON.stringify(redactSensitive(safeOutput[key])));
    }
  }

  return { workflow_hash: workflowHash, artifacts, final_output: artifacts };
}

const OutputSchema = z.record(z.unknown());

function renderTemplate(input: unknown, artifacts: Record<string, unknown>): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") {
      out[k] = v.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => String(artifacts[name] ?? ""));
    } else {
      out[k] = v;
    }
  }
  return out;
}

function rejectCommandLikeFields(input: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(input)) {
    if (/^(cmd|command|shell|exec)$/i.test(key)) {
      throw new Error(`disallowed command-like field in tool input: ${key}`);
    }
  }
  return input;
}
