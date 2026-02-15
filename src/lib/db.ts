import { Database } from "bun:sqlite";
import { getConfig } from "./config.js";
import { readFileSync } from "fs";
import { join } from "path";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    const config = getConfig();
    const path = join(process.cwd(), config.db_path);
    db = new Database(path, { create: true });
    db.run("PRAGMA foreign_keys = ON");
    runSchema();
  }
  return db;
}

function runSchema(): void {
  const schemaPath = join(process.cwd(), "schema.sql");
  try {
    const sql = readFileSync(schemaPath, "utf-8");
    db!.exec(sql);
  } catch (e) {
    console.warn("Could not run schema.sql:", e);
  }
}
