import type { Database } from "bun:sqlite";
import {
  getDb as getPuesDb,
  resetDbForTesting as resetPuesDbForTesting,
} from "pues/base/db/server";
import { getConfig } from "./config.js";

let pathBridged = false;

export function getDb(): Database {
  bridgeLegacyDbPath();
  return getPuesDb();
}

export function resetDbForTesting(): void {
  pathBridged = false;
  resetPuesDbForTesting();
}

function bridgeLegacyDbPath(): void {
  if (pathBridged) return;
  pathBridged = true;
  if (process.env.PUES_DB_PATH) return;
  const legacyPath = getConfig().db_path?.trim();
  if (legacyPath) {
    process.env.PUES_DB_PATH = legacyPath;
  }
}
