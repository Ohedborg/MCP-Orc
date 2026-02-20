import Database from "better-sqlite3";
import { applySchema } from "./schema.js";

export function openDatabase(path = "./orchestrator.sqlite"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  applySchema(db);
  return db;
}
