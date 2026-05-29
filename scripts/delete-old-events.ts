#!/usr/bin/env bun
import { getDb } from "../src/lib/db.js";

/**
 * Housekeeping: delete webhook_events older than each webhook's policy.retention_days.
 * Runs hourly in-process via `src/lib/scheduler.ts`; can also be invoked
 * as a CLI (`bun run scripts/delete-old-events.ts`) for ad-hoc use.
 *
 * Each webhook's policy JSON can have retention_days (default 7). Events with
 * created_at older than that many days ago are deleted.
 */

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

export function runDeleteOldEvents(): { totalDeleted: number } {
  const db = getDb();
  const webhooks = db
    .query("SELECT id, policy FROM webhooks")
    .all() as { id: number; policy: string | null }[];
  const now = Math.floor(Date.now() / 1000);
  let totalDeleted = 0;

  for (const w of webhooks) {
    const retentionDays = getRetentionDays(w.policy);
    const cutoff = now - retentionDays * 24 * 3600;
    const r = db.run(
      "DELETE FROM webhook_events WHERE webhook_id = ? AND created_at < ?",
      [w.id, cutoff],
    );
    totalDeleted += r.changes;
  }
  return { totalDeleted };
}

if (import.meta.main) {
  const { totalDeleted } = runDeleteOldEvents();
  console.log(`Deleted ${totalDeleted} old event(s).`);
}
