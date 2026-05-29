import { ulid } from "pues/base/core";
import { getDb } from "./db.js";
import { toWebhookSlug } from "./webhookSlug.js";

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
  const label = "My default webhook";
  const webhookUlid = ulid();
  db.run(
    "INSERT INTO webhooks (user_id, ulid, name, slug, policy) VALUES (?, ?, ?, ?, ?)",
    [userId, webhookUlid, label, toWebhookSlug(label), DEFAULT_POLICY],
  );
}
