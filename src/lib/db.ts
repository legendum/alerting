import { Database } from "bun:sqlite";
import { getConfig } from "./config.js";
import { readFileSync } from "fs";
import { join } from "path";
import { log } from "./logger.js";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const config = getConfig();
    const path = join(process.cwd(), config.db_path);
    db = new Database(path, { create: true });
    db.run("PRAGMA foreign_keys = ON");
    runSchema();
    migrate();
  }
  return db;
}

function runSchema(): void {
  const schemaPath = join(process.cwd(), "schema.sql");
  try {
    const sql = readFileSync(schemaPath, "utf-8");
    db!.exec(sql);
  } catch (e) {
    log.warn("Could not run schema.sql", e);
  }
}

function migrate(): void {
  try {
    const cols = db!.query("PRAGMA table_info(tokens)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "legendum_token")) {
      db!.run("ALTER TABLE tokens ADD COLUMN legendum_token TEXT");
    }
  } catch (e) {
    log.warn("Migration failed", e);
  }
}
