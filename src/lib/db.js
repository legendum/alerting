import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

let db = null;
export function getDb() {
  if (!db) {
    const config = getConfig();
    const path = join(process.cwd(), config.db_path);
    db = new Database(path, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");
    runSchema();
  }
  return db;
}
function runSchema() {
  const schemaPath = join(process.cwd(), "schema.sql");
  try {
    const sql = readFileSync(schemaPath, "utf-8");
    db.exec(sql);
  } catch (e) {
    log.warn("Could not run schema.sql", e);
  }
}
