#!/usr/bin/env bun
import { Database } from "bun:sqlite";

/**
 * Housekeeping: reset quota_basic to 100 every 7 days (rolling window from quota_reset).
 * Run via cron (e.g. daily) so tokens that are due get reset.
 *
 * Usage:
 *   bun run scripts/reset-quota-weekly.ts
 *
 * For each token, if quota_reset is null or at least 7 days have passed since quota_reset,
 * sets quota_basic = 100 and quota_reset = now. No calendar day or midnight — purely
 * "7 days since last reset".
 */

const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;

const SEVEN_DAYS_SEC = 7 * 24 * 3600;

const db = new Database(DB_PATH);

try {
  db.run("ALTER TABLE tokens ADD COLUMN quota_reset INTEGER");
} catch {
  // Column already exists
}

const rows = db.query("SELECT token_hash, quota_reset FROM tokens").all() as {
  token_hash: string;
  quota_reset: number | null;
}[];

const now = Math.floor(Date.now() / 1000);
let resetCount = 0;

for (const row of rows) {
  const due = row.quota_reset == null || now - row.quota_reset >= SEVEN_DAYS_SEC;
  if (due) {
    db.run(
      "UPDATE tokens SET quota_basic = 100, quota_reset = ? WHERE token_hash = ?",
      now,
      row.token_hash
    );
    resetCount++;
  }
}

console.log(`Reset quota_basic to 100 for ${resetCount} token(s).`);
db.close();
