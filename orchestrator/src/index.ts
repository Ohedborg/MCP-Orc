import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { openDatabase } from "./db/client.js";
import { Repository } from "./db/repository.js";
import { createMcpServer } from "./mcp/server.js";
import { log } from "./security/logger.js";

async function main(): Promise<void> {
  const dbPath = process.env.ORCHESTRATOR_DB_PATH ?? "./orchestrator.sqlite";
  const db = openDatabase(dbPath);
  const repository = new Repository(db);
  const server = createMcpServer(repository);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  log("info", "orchestrator MCP server started", { db_path: dbPath, transport: "stdio" });
}

main().catch((error) => {
  log("error", "orchestrator MCP server failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
