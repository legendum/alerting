import { getDb } from "./db.js";
import { ulid } from "./ulid.js";

const DEFAULT_POLICY = JSON.stringify({
  email_schedule: "never",
  retention_days: 7,
});

/** Pues `onNewUser` — quota reset timestamp + starter webhook (matches legacy callback). */
export function seedDefaultWebhookForNewUser(userId: number): void {
  const db = getDb();
  db.run(
    "UPDATE users SET quota_reset = strftime('%s', 'now') WHERE id = ? AND quota_reset IS NULL",
    [userId],
  );
  db.run(
    "INSERT INTO webhooks (user_id, ulid, name, policy) VALUES (?, ?, 'My default webhook', ?)",
    [userId, ulid(), DEFAULT_POLICY],
  );
}
