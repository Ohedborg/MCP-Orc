import type Database from "better-sqlite3";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface RunRecord {
  run_id: string;
  workflow_id: string;
  status: RunStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface ToolCallRecord {
  run_id: string;
  step_id: string;
  tool_name: string;
  input_redacted: string;
  output_redacted: string;
  created_at: string;
}

export class Repository {
  constructor(private readonly db: Database.Database) {}

  insertRun(run: RunRecord): void {
    this.db
      .prepare(
        `INSERT INTO runs (run_id, workflow_id, status, created_at, started_at, finished_at, error)
         VALUES (@run_id, @workflow_id, @status, @created_at, @started_at, @finished_at, @error)`,
      )
      .run(run);
  }

  insertStep(runId: string, stepId: string, status: string): void {
    this.db
      .prepare(
        `INSERT INTO steps (run_id, step_id, status, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(runId, stepId, status, new Date().toISOString());
  }

  insertToolCall(record: ToolCallRecord): void {
    this.db
      .prepare(
        `INSERT INTO tool_calls (run_id, step_id, tool_name, input_redacted, output_redacted, created_at)
         VALUES (@run_id, @step_id, @tool_name, @input_redacted, @output_redacted, @created_at)`,
      )
      .run(record);
  }

  insertArtifact(runId: string, stepId: string, artifactName: string, redactedValue: string): void {
    this.db
      .prepare(
        `INSERT INTO artifacts (run_id, step_id, artifact_name, artifact_value_redacted, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(runId, stepId, artifactName, redactedValue, new Date().toISOString());
  }

  updateRunStatus(runId: string, status: RunStatus, error: string | null = null): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE runs
         SET status = ?,
             started_at = COALESCE(started_at, CASE WHEN ? = 'running' THEN ? ELSE started_at END),
             finished_at = CASE WHEN ? IN ('completed','failed') THEN ? ELSE finished_at END,
             error = ?
         WHERE run_id = ?`,
      )
      .run(status, status, now, status, now, error, runId);
  }

  getRun(runId: string): RunRecord | undefined {
    return this.db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as RunRecord | undefined;
  }

  getSteps(runId: string): Array<Record<string, unknown>> {
    return this.db.prepare(`SELECT step_id, status, created_at, started_at, finished_at FROM steps WHERE run_id = ? ORDER BY id`).all(runId) as Array<Record<string, unknown>>;
  }

  getToolCalls(runId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare(`SELECT step_id, tool_name, input_redacted, output_redacted, created_at FROM tool_calls WHERE run_id = ? ORDER BY id`)
      .all(runId) as Array<Record<string, unknown>>;
  }

  getArtifacts(runId: string): Array<Record<string, unknown>> {
    return this.db
      .prepare(`SELECT step_id, artifact_name, artifact_value_redacted, created_at FROM artifacts WHERE run_id = ? ORDER BY id`)
      .all(runId) as Array<Record<string, unknown>>;
  }
}
