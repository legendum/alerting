#!/usr/bin/env bun
/**
 * Send daily digest emails for webhooks with policy.email === "daily".
 * Run via cron once per day (e.g. 08:00). Sends one email per user with
 * events from the last 24 hours for their "daily" webhooks.
 *
 * Usage (from project root):
 *   bun run scripts/send-daily-digest.ts
 */

import process from "process";
process.chdir(new URL("..", import.meta.url).pathname);

import { getDb } from "../src/lib/db.js";
import { getConfig } from "../src/lib/config.js";
import { sendTemplatedEmail } from "../src/lib/email.js";
import { renderNotificationBox } from "../src/lib/emailNotification.js";

const TWENTY_FOUR_HOURS_SEC = 24 * 3600;

function parseEmailPolicy(policyJson: string | null): string {
  if (!policyJson?.trim()) return "never";
  try {
    const p = JSON.parse(policyJson) as { email?: string };
    return p?.email === "each" || p?.email === "daily" ? p.email : "never";
  } catch {
    return "never";
  }
}

function buildNotificationBoxes(
  events: { webhook_name: string; title: string | null; body: string | null; created_at: number }[],
  timezone: string | null
): string {
  return events
    .map((e) => {
      const title = (e.title ?? "Alert").trim() || "Alert";
      const body = e.body?.trim() || null;
      return renderNotificationBox(title, body, e.created_at, timezone, e.webhook_name);
    })
    .join("\n");
}

const db = getDb();
const config = getConfig();

const webhooks = db.query("SELECT id, token_hash, name, policy FROM webhooks").all() as {
  id: number;
  token_hash: string;
  name: string;
  policy: string | null;
}[];

const dailyByToken = new Map<string, { webhookIds: number[]; webhookNames: Record<number, string> }>();
for (const w of webhooks) {
  if (parseEmailPolicy(w.policy) !== "daily") continue;
  let entry = dailyByToken.get(w.token_hash);
  if (!entry) {
    entry = { webhookIds: [], webhookNames: {} };
    dailyByToken.set(w.token_hash, entry);
  }
  entry.webhookIds.push(w.id);
  entry.webhookNames[w.id] = w.name;
}

const since = Math.floor(Date.now() / 1000) - TWENTY_FOUR_HOURS_SEC;
let sent = 0;

for (const [tokenHash, { webhookIds, webhookNames }] of dailyByToken) {
  const tokenRow = db.query("SELECT email, timezone FROM tokens WHERE token_hash = ?").get(tokenHash) as
    | { email: string; timezone: string | null }
    | undefined;
  if (!tokenRow?.email) continue;

  const placeholders = webhookIds.map(() => "?").join(",");
  const rows = db.query(
    `SELECT e.id, e.webhook_id, e.title, e.body, e.created_at
     FROM webhook_events e
     WHERE e.webhook_id IN (${placeholders}) AND e.created_at >= ?
     ORDER BY e.created_at DESC`,
    ...webhookIds,
    since
  ).all() as { webhook_id: number; title: string | null; body: string | null; created_at: number }[];

  if (rows.length === 0) continue;

  const events = rows.map((r) => ({
    webhook_name: webhookNames[r.webhook_id] ?? "Webhook",
    title: r.title,
    body: r.body,
    created_at: r.created_at,
  }));
  const notificationBoxes = buildNotificationBoxes(events, tokenRow.timezone);

  try {
    await sendTemplatedEmail("digest", tokenRow.email, {
      app_name: config.app_name,
      notification_boxes: notificationBoxes,
      inbox_url: config.domain,
    });
    sent++;
  } catch (err) {
    console.error("Digest email failed for", tokenRow.email, err);
  }
}

console.log(`Sent ${sent} daily digest(s).`);
db.close();
