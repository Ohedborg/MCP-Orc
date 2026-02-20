import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Repository } from "../db/repository.js";
import { redactSensitive } from "../security/redaction.js";
import { log } from "../security/logger.js";
import { requestId } from "../security/request-id.js";
import {
  GetRunTraceInputSchema,
  RunTraceSchema,
  RunWorkflowInputSchema,
  RunWorkflowOutputSchema,
  StepBridgeParamsSchema,
} from "./schemas.js";
import { createRun, invokeTool } from "../runner-client/client.js";

export function createMcpServer(repository: Repository): McpServer {
  const server = new McpServer({
    name: "mcp-orc-orchestrator",
    version: "0.1.0",
  });

  server.tool(
    "run_workflow",
    "Queue and execute a minimal single-step bridged workflow.",
    {
      workflow_id: RunWorkflowInputSchema.shape.workflow_id,
      params: RunWorkflowInputSchema.shape.params,
    },
    async (rawInput) => {
      const reqId = requestId();
      const input = RunWorkflowInputSchema.parse(rawInput);
      const runId = randomUUID();
      const createdAt = new Date().toISOString();

      repository.insertRun({
        run_id: runId,
        workflow_id: input.workflow_id,
        status: "queued",
        created_at: createdAt,
        started_at: null,
        finished_at: null,
        error: null,
      });

      repository.insertStep(runId, "workflow-init", "queued");
      repository.insertToolCall({
        run_id: runId,
        step_id: "workflow-init",
        tool_name: "run_workflow",
        input_redacted: JSON.stringify(redactSensitive(input)),
        output_redacted: JSON.stringify({ run_id: runId, status: "queued" }),
        created_at: createdAt,
      });

      try {
        repository.updateRunStatus(runId, "running");
        const bridge = StepBridgeParamsSchema.parse(input.params);

        const runnerRun = await createRun({
          image_ref: bridge.image_ref,
          command: bridge.command,
          args: bridge.args,
          allowed_tools: bridge.allowed_tools,
          downstream_port: bridge.downstream_port,
          cpu: bridge.cpu,
          memory: bridge.memory,
          timeout_seconds: bridge.timeout_seconds,
          network_policy_profile: bridge.network_policy_profile,
        });

        const invoke = await invokeTool(runnerRun.run_id, bridge.tool_name, bridge.tool_input);

        repository.insertStep(runId, "bridge-tool-call", "completed");
        repository.insertToolCall({
          run_id: runId,
          step_id: "bridge-tool-call",
          tool_name: bridge.tool_name,
          input_redacted: JSON.stringify(redactSensitive(bridge.tool_input)),
          output_redacted: JSON.stringify(redactSensitive(invoke.output)),
          created_at: new Date().toISOString(),
        });

        repository.updateRunStatus(runId, "completed");
      } catch (error) {
        repository.insertStep(runId, "bridge-tool-call", "failed");
        repository.updateRunStatus(runId, "failed", error instanceof Error ? error.message : String(error));
      }

      const run = repository.getRun(runId);
      const output = RunWorkflowOutputSchema.parse({
        run_id: runId,
        status: run?.status ?? "failed",
      });

      log("info", "workflow run handled", {
        request_id: reqId,
        tool: "run_workflow",
        run_id: runId,
        workflow_id: input.workflow_id,
        status: output.status,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output),
          },
        ],
        structuredContent: output,
      };
    },
  );

  server.tool(
    "get_run_trace",
    "Return the redacted run trace by run ID.",
    {
      run_id: GetRunTraceInputSchema.shape.run_id,
    },
    async (rawInput) => {
      const reqId = requestId();
      const input = GetRunTraceInputSchema.parse(rawInput);
      const run = repository.getRun(input.run_id);

      if (!run) {
        log("warn", "run trace not found", {
          request_id: reqId,
          tool: "get_run_trace",
          run_id: input.run_id,
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ error: "run_not_found" }) }],
          structuredContent: { error: "run_not_found" },
          isError: true,
        };
      }

      const trace = RunTraceSchema.parse({
        ...run,
        steps: repository.getSteps(input.run_id),
        tool_calls: repository.getToolCalls(input.run_id),
      });

      repository.insertToolCall({
        run_id: input.run_id,
        step_id: "trace",
        tool_name: "get_run_trace",
        input_redacted: JSON.stringify(redactSensitive(input)),
        output_redacted: JSON.stringify({ run_id: trace.run_id, status: trace.status }),
        created_at: new Date().toISOString(),
      });

      log("info", "run trace fetched", {
        request_id: reqId,
        tool: "get_run_trace",
        run_id: input.run_id,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(trace),
          },
        ],
        structuredContent: trace,
      };
    },
  );

  return server;
}
