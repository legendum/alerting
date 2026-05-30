import { runDeleteOldEvents } from "../../scripts/delete-old-events.js";
import { runResetQuotaWeekly } from "../../scripts/reset-quota-weekly.js";
import { runSendDailyDigest } from "../../scripts/send-daily-digest.js";
import { log } from "./logger.js";

/**
 * Hourly housekeeping jobs run inside the server process. Replaces the
 * previous crontab entries; the underlying scripts/ files still work as
 * standalone CLIs for ad-hoc runs.
 *
 * All three jobs are idempotent and gate their work internally
 * (quota-reset checks the 7-day window; digest checks the per-user
 * mail_hour; delete-old-events is a cutoff DELETE). Safe to run on every
 * tick; safe to restart the server without missing a beat.
 */

const HOUR_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 30 * 1000;

let started = false;

async function safeRun(
  name: string,
  fn: () => Promise<unknown> | unknown,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log.error(`Scheduler: ${name} failed`, err);
  }
}

async function tick(): Promise<void> {
  await safeRun("reset-quota-weekly", runResetQuotaWeekly);
  await safeRun("delete-old-events", runDeleteOldEvents);
  await safeRun("send-daily-digest", runSendDailyDigest);
}

export function startScheduler(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    void tick();
  }, BOOT_DELAY_MS);
  setInterval(() => {
    void tick();
  }, HOUR_MS);
  log.info(
    "Scheduler: hourly jobs registered (reset-quota-weekly, delete-old-events, send-daily-digest)",
  );
}
