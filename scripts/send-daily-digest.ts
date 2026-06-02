#!/usr/bin/env bun
/**
 * Send digest emails for webhooks with policy.email_schedule === "daily"
 * (last 24h, every day at mail_hour) or "weekly" (last 7d, Mondays at
 * mail_hour). Runs hourly in-process via `src/lib/scheduler.ts`; can also
 * be invoked as a CLI (`bun run scripts/send-daily-digest.ts`) for ad-hoc
 * use, which sends both due digests.
 *
 * Sends one email per user, gated on the configured `mail_hour` (and, for
 * weekly, Monday) in the user's timezone.
 */

import { getConfig } from "../src/lib/config.js";
import { getDb } from "../src/lib/db.js";
import { sendTemplatedEmail } from "../src/lib/email.js";
import { renderNotificationBox } from "../src/lib/emailNotification.js";

const DAY_SEC = 24 * 3600;
const WEEK_SEC = 7 * DAY_SEC;
/** Day-of-week (0=Sun … 6=Sat) on which weekly digests are sent. */
const WEEKLY_SEND_WEEKDAY = 1; // Monday

type Schedule = "daily" | "weekly";

function parseEmailPolicy(policyJson: string | null): string {
  if (!policyJson?.trim()) return "never";
  try {
    const p = JSON.parse(policyJson) as { email_schedule?: string };
    return p?.email_schedule === "daily" || p?.email_schedule === "weekly"
      ? p.email_schedule
      : "never";
  } catch {
    return "never";
  }
}

function buildNotificationBoxes(
  events: { webhook_name: string; title: string | null; body: string | null; created_at: number }[],
  timezone: string | null,
): string {
  return events
    .map((e) => {
      const title = (e.title ?? "Alert").trim() || "Alert";
      const body = e.body?.trim() || null;
      return renderNotificationBox(title, body, e.created_at, timezone, e.webhook_name);
    })
    .join("\n");
}

/** Hour (0-23) and weekday (0=Sun…6=Sat) "now" in the given timezone (UTC fallback). */
function nowInTimezone(timezone: string | null): { hour: number; weekday: number } {
  const tz = timezone && timezone.trim() ? timezone : "UTC";
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const weekdayName = parts.find((p) => p.type === "weekday")?.value ?? "";
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
    return { hour, weekday };
  } catch (err) {
    console.error(`Invalid timezone "${tz}", defaulting to UTC:`, err);
    const now = new Date();
    return { hour: now.getUTCHours(), weekday: now.getUTCDay() };
  }
}

/** True if this user is due to receive the given digest right now. */
function isDigestDue(schedule: Schedule, timezone: string | null, mailHour: number): boolean {
  const { hour, weekday } = nowInTimezone(timezone);
  if (hour !== mailHour) return false;
  if (schedule === "weekly" && weekday !== WEEKLY_SEND_WEEKDAY) return false;
  return true;
}

async function runDigest(schedule: Schedule): Promise<{ sent: number }> {
  const db = getDb();
  const config = getConfig();
  const mailHour = config.mail_hour ?? 8;
  const windowSec = schedule === "weekly" ? WEEK_SEC : DAY_SEC;

  const webhooks = db
    .query("SELECT id, user_id, name, policy FROM webhooks")
    .all() as {
      id: number;
      user_id: number;
      name: string;
      policy: string | null;
    }[];

  const byUser = new Map<number, { webhookIds: number[]; webhookNames: Record<number, string> }>();
  for (const w of webhooks) {
    if (parseEmailPolicy(w.policy) !== schedule) continue;
    let entry = byUser.get(w.user_id);
    if (!entry) {
      entry = { webhookIds: [], webhookNames: {} };
      byUser.set(w.user_id, entry);
    }
    entry.webhookIds.push(w.id);
    entry.webhookNames[w.id] = w.name;
  }

  const since = Math.floor(Date.now() / 1000) - windowSec;
  let sent = 0;

  for (const [userId, { webhookIds, webhookNames }] of byUser) {
    const userRow = db
      .query("SELECT email, timezone FROM users WHERE id = ?")
      .get(userId) as { email: string; timezone: string | null } | undefined;
    if (!userRow?.email) continue;

    if (!isDigestDue(schedule, userRow.timezone, mailHour)) continue;

    const placeholders = webhookIds.map(() => "?").join(",");
    const rows = db
      .query(
        `SELECT e.id, e.webhook_id, e.title, e.body, e.created_at
       FROM webhook_events e
       WHERE e.webhook_id IN (${placeholders}) AND e.created_at >= ?
       ORDER BY e.created_at DESC`,
      )
      .all(...webhookIds, since) as {
        webhook_id: number;
        title: string | null;
        body: string | null;
        created_at: number;
      }[];

    if (rows.length === 0) continue;

    const events = rows.map((r) => ({
      webhook_name: webhookNames[r.webhook_id] ?? "Webhook",
      title: r.title,
      body: r.body,
      created_at: r.created_at,
    }));
    const notificationBoxes = buildNotificationBoxes(events, userRow.timezone);

    try {
      await sendTemplatedEmail("digest", userRow.email, {
        app_name: config.app_name,
        notification_boxes: notificationBoxes,
        inbox_url: config.domain,
      });
      sent++;
    } catch (err) {
      console.error("Digest email failed for", userRow.email, err);
    }
  }

  return { sent };
}

export function runSendDailyDigest(): Promise<{ sent: number }> {
  return runDigest("daily");
}

export function runSendWeeklyDigest(): Promise<{ sent: number }> {
  return runDigest("weekly");
}

if (import.meta.main) {
  const daily = await runSendDailyDigest();
  const weekly = await runSendWeeklyDigest();
  console.log(`Sent ${daily.sent} daily and ${weekly.sent} weekly digest(s).`);
}
