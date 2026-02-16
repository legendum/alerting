import { getDb } from "../../lib/db.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import { sendFcmPush } from "../../lib/fcm.js";
import { getConfig } from "../../lib/config.js";
import { log } from "../../lib/logger.js";
import { json } from "../json.js";

const MAX_TITLE_LEN = 256;
const MAX_BODY_LEN = 1024;

export async function triggerWebhook(req: Request, ulidParam: string): Promise<Response> {
  const db = getDb();
  const webhookRow = db.query(`
    SELECT w.id, w.token_hash, w.name, w.policy, t.email
    FROM webhooks w
    JOIN tokens t ON t.token_hash = w.token_hash
    WHERE w.ulid = ?
  `).get(ulidParam) as { id: number; token_hash: string; name: string; policy: string | null; email: string } | undefined;
  if (!webhookRow) {
    log.warn("Trigger: webhook not found", ulidParam);
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  }

  const token = db.query("SELECT quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(webhookRow.token_hash) as { quota_basic: number; quota_extra: number } | undefined;
  if (!token) return json({ error: "not_found" }, 404);

  const total = token.quota_basic + token.quota_extra;
  if (total <= 0) {
    log.warn("Trigger: quota exceeded", ulidParam);
    return json({ error: "quota_exceeded", message: "No quota" }, 429);
  }

  const policy = ((): { email?: string } => {
    try {
      return webhookRow.policy ? (JSON.parse(webhookRow.policy) as { email?: string }) : {};
    } catch {
      return {};
    }
  })();
  const emailPolicy = policy.email === "each" || policy.email === "daily" ? policy.email : "never";

  let title = "You have an alert";
  let body: string | null = null;
  const url = new URL(req.url);
  const qTitle = url.searchParams.get("title");
  const qBody = url.searchParams.get("body");
  if (qTitle != null) title = qTitle;
  if (qBody != null) body = qBody;
  const contentType = req.headers.get("content-type") ?? "";
  if (req.method === "POST") {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      try {
        const form = await req.formData();
        const t = form.get("title"); if (t != null) title = String(t);
        const b = form.get("body"); if (b != null) body = String(b);
      } catch {
        // ignore
      }
    } else {
      try {
        const payload = (await req.json()) as { title?: string; body?: string };
        if (payload?.title) title = String(payload.title);
        if (payload?.body != null) body = String(payload.body);
      } catch {
        // Non-JSON or empty POST body; query params already applied above
      }
    }
  }

  if (title.length > MAX_TITLE_LEN) title = title.slice(0, MAX_TITLE_LEN);
  if (body != null && body.length > MAX_BODY_LEN) body = body.slice(0, MAX_BODY_LEN);

  const now = Math.floor(Date.now() / 1000);
  db.run(
    `UPDATE tokens SET
      quota_basic = quota_basic - (CASE WHEN quota_basic > 0 THEN 1 ELSE 0 END),
      quota_extra = quota_extra - (CASE WHEN quota_basic > 0 THEN 0 ELSE 1 END)
    WHERE token_hash = ?`,
    webhookRow.token_hash
  );
  db.run(
    "INSERT INTO webhook_events (webhook_id, token_hash, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
    webhookRow.id,
    webhookRow.token_hash,
    title,
    body,
    now
  );

  const fcmRows = db.query("SELECT fcm_token FROM fcm_tokens WHERE token_hash = ?").all(webhookRow.token_hash) as { fcm_token: string }[];
  for (const row of fcmRows) {
    await sendFcmPush({ fcmToken: row.fcm_token, title, body: body ?? undefined });
  }

  if (emailPolicy === "each") {
    const config = getConfig();
    try {
      await sendTemplatedEmail("alert", webhookRow.email, {
        app_name: config.app_name,
        webhook_name: webhookRow.name,
        title,
        body: body ?? "",
        inbox_url: config.domain,
      });
    } catch (err) {
      log.error("Trigger: alert email failed", webhookRow.email, err);
    }
  }

  log.info("Trigger: delivered", { ulid: ulidParam, title: title?.slice(0, 50) });
  return json({ ok: true, title, body: body ?? null }, 202);
}
