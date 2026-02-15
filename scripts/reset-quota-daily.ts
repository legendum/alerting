#!/usr/bin/env bun
import { Database } from "bun:sqlite";

/**
 * Housekeeping: reset quota_basic to 100 at midnight (per token timezone).
 * Run via cron every hour (or at least once per day) so all timezones get reset.
 *
 * Usage:
 *   bun run scripts/reset-quota-daily.ts
 *
 * For each token, "today" is computed in the token's timezone (or UTC if unset).
 * If quota_reset is null or its date (in that timezone) is before today, sets quota_basic = 100
 * and quota_reset = Unix epoch (seconds) of now.
 */

const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;

/** Date string YYYY-MM-DD for a Unix timestamp in the given timezone. */
function dateInTimezone(epochSec: number, tz: string | null): string {
  return new Date(epochSec * 1000).toLocaleDateString("en-CA", { timeZone: tz ?? "UTC" });
}

/** Today as YYYY-MM-DD in the given timezone. */
function todayInTimezone(tz: string | null): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz ?? "UTC" });
}

const db = new Database(DB_PATH);

try {
  db.run("ALTER TABLE tokens ADD COLUMN quota_reset INTEGER");
} catch {
  // Column already exists
}

const rows = db.query("SELECT token_hash, timezone, quota_reset FROM tokens").all() as {
  token_hash: string;
  timezone: string | null;
  quota_reset: number | null;
}[];

const now = Math.floor(Date.now() / 1000);
let resetCount = 0;

for (const row of rows) {
  const tokenToday = todayInTimezone(row.timezone);
  const lastResetDate = row.quota_reset != null ? dateInTimezone(row.quota_reset, row.timezone) : "";
  if (lastResetDate < tokenToday) {
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
