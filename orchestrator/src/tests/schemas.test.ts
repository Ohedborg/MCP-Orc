import test from "node:test";
import assert from "node:assert/strict";
import { GetRunTraceInputSchema, RunWorkflowInputSchema } from "../mcp/schemas.js";

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
