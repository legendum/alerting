#!/usr/bin/env bun
import { Database } from "bun:sqlite";

/**
 * Housekeeping: reset quota_basic to 100 at midnight (per token timezone).
 * Run via cron every hour (or at least once per day) so all timezones get reset.
 *
 * Usage:
 *   bun run scripts/reset-quota-daily.ts
 *
 * For each token, computes "today" in the token's timezone (or UTC if unset).
 * If last_quota_reset_date is null or earlier than today, sets quota_basic = 100
 * and last_quota_reset_date = today.
 */

const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;

function todayInTimezone(tz: string | null): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz ?? "UTC" });
}

const db = new Database(DB_PATH);

try {
  db.run("ALTER TABLE tokens ADD COLUMN last_quota_reset_date TEXT");
} catch {
  // Column already exists
}

const rows = db.query("SELECT token_hash, timezone, last_quota_reset_date FROM tokens").all() as {
  token_hash: string;
  timezone: string | null;
  last_quota_reset_date: string | null;
}[];

const today = todayInTimezone("UTC");
let resetCount = 0;

for (const row of rows) {
  const tokenToday = todayInTimezone(row.timezone);
  const lastReset = row.last_quota_reset_date ?? "";
  if (lastReset < tokenToday) {
    db.run(
      "UPDATE tokens SET quota_basic = 100, last_quota_reset_date = ? WHERE token_hash = ?",
      tokenToday,
      row.token_hash
    );
    resetCount++;
  }
}

console.log(`Reset quota_basic to 100 for ${resetCount} token(s) (today: ${today}).`);
db.close();
