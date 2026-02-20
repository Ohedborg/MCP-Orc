import test from "node:test";
import assert from "node:assert/strict";
import { GetRunTraceInputSchema, RunWorkflowInputSchema, StepBridgeParamsSchema } from "../mcp/schemas.js";

test("run_workflow input schema validates expected payload", () => {
  const parsed = RunWorkflowInputSchema.parse({
    workflow_id: "wf-1",
    params: { name: "abc" },
  });

  assert.equal(parsed.workflow_id, "wf-1");
});

test("get_run_trace rejects non-uuid", () => {
  assert.throws(() => GetRunTraceInputSchema.parse({ run_id: "not-uuid" }));
});

test("bridge params enforce allowed tools", () => {
  const parsed = StepBridgeParamsSchema.parse({
    image_ref: "cgr.dev/chainguard/curl:latest",
    allowed_tools: ["echo"],
    tool_name: "echo",
    tool_input: { value: "hello" },
  });
  assert.equal(parsed.tool_name, "echo");
  assert.throws(() =>
    StepBridgeParamsSchema.parse({ image_ref: "x", allowed_tools: [], tool_name: "echo", tool_input: {} }),
  );
});
