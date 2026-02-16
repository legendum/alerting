#!/usr/bin/env bun
import { Database } from "bun:sqlite";

/**
 * Housekeeping: delete webhook_events older than each webhook's policy.retention_days.
 * Run via cron (e.g. daily) so the DB doesn't grow indefinitely.
 *
 * Usage:
 *   bun run scripts/delete-old-events.ts
 *
 * Each webhook's policy JSON can have retention_days (default 7). Events with
 * created_at older than that many days ago are deleted.
 */

const DB_PATH = new URL("../data/alert.db", import.meta.url).pathname;

const DEFAULT_RETENTION_DAYS = 7;

function getRetentionDays(policyJson: string | null): number {
  if (!policyJson?.trim()) return DEFAULT_RETENTION_DAYS;
  try {
    const p = JSON.parse(policyJson) as { retention_days?: number };
    const d = p?.retention_days;
    return typeof d === "number" && d > 0 && Number.isFinite(d) ? d : DEFAULT_RETENTION_DAYS;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

const db = new Database(DB_PATH);

const webhooks = db.query("SELECT id, policy FROM webhooks").all() as { id: number; policy: string | null }[];
const now = Math.floor(Date.now() / 1000);
let totalDeleted = 0;

for (const w of webhooks) {
  const retentionDays = getRetentionDays(w.policy);
  const cutoff = now - retentionDays * 24 * 3600;
  const r = db.run("DELETE FROM webhook_events WHERE webhook_id = ? AND created_at < ?", w.id, cutoff);
  totalDeleted += r.changes;
}

console.log(`Deleted ${totalDeleted} old event(s).`);
db.close();
