#!/usr/bin/env bun
import { getDb } from "../src/lib/db.js";

/**
 * Reset quota_basic to 100 every 7 days (rolling window from quota_reset).
 * Run via cron every hour: bun run scripts/reset-quota-weekly.ts
 */

const SEVEN_DAYS_SEC = 7 * 24 * 3600;

const db = getDb();
const now = Math.floor(Date.now() / 1000);
const rows = db
  .query(
    "SELECT id, quota_reset FROM users WHERE quota_reset IS NOT NULL AND ? - quota_reset >= ?",
  )
  .all(now, SEVEN_DAYS_SEC) as { id: number; quota_reset: number }[];

let resetCount = 0;
for (const row of rows) {
  db.run("UPDATE users SET quota_basic = 100, quota_reset = ? WHERE id = ?", [
    now,
    row.id,
  ]);
  resetCount++;
}

console.log(`Reset quota_basic to 100 for ${resetCount} user(s).`);
