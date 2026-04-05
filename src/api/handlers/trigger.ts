import { getConfig } from "../../lib/config.js";
import { getDb } from "../../lib/db.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import { renderNotificationBox } from "../../lib/emailNotification.js";
import { sendFcmPush } from "../../lib/fcm.js";
import { log } from "../../lib/logger.js";
import { json } from "../json.js";

// @ts-expect-error — pure JS SDK
const legendum = require("../../lib/legendum.js");

const MAX_TITLE_LEN = 256;
const MAX_BODY_LEN = 1024;

export async function triggerWebhook(
  req: Request,
  ulidParam: string,
): Promise<Response> {
  const db = getDb();
  const webhookRow = db
    .query(`
    SELECT w.id, w.user_id, w.name, w.policy, u.email, u.timezone
    FROM webhooks w
    JOIN users u ON u.id = w.user_id
    WHERE w.ulid = ?
  `)
    .get(ulidParam) as
    | {
        id: number;
        user_id: number;
        name: string;
        policy: string | null;
        email: string;
        timezone: string | null;
      }
    | undefined;
  if (!webhookRow) {
    log.warn("Trigger: webhook not found", ulidParam);
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  }

  const user = db
    .query(
      "SELECT quota_basic, quota_extra, legendum_token FROM users WHERE id = ?",
    )
    .get(webhookRow.user_id) as
    | {
        quota_basic: number;
        quota_extra: number;
        legendum_token: string | null;
      }
    | undefined;
  if (!user) return json({ error: "not_found" }, 404);

  const total = user.quota_basic + user.quota_extra;
  let usedLegendum = false;
  if (total <= 0) {
    // Try Legendum credits if the user has linked their account
    if (user.legendum_token && legendum.isConfigured()) {
      const lc = legendum.client();
      const charge = await lc.charge(
        user.legendum_token,
        1,
        "alerting.app alert",
        { key: `alert-${ulidParam}-${Date.now()}` },
      );
      if (!charge.ok) {
        log.warn(
          "Trigger: quota exceeded, Legendum charge failed",
          ulidParam,
          charge.error,
        );
        return json({ error: "quota_exceeded", message: "No quota" }, 429);
      }
      usedLegendum = true;
    } else {
      log.warn("Trigger: quota exceeded", ulidParam);
      return json({ error: "quota_exceeded", message: "No quota" }, 429);
    }
  }

  const policy = ((): { email_schedule?: string } => {
    try {
      return webhookRow.policy
        ? (JSON.parse(webhookRow.policy) as { email_schedule?: string })
        : {};
    } catch {
      return {};
    }
  })();
  const emailPolicy =
    policy.email_schedule === "each" || policy.email_schedule === "daily"
      ? policy.email_schedule
      : "never";

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
        const t = form.get("title");
        if (t != null) title = String(t);
        const b = form.get("body");
        if (b != null) body = String(b);
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
  if (body != null && body.length > MAX_BODY_LEN)
    body = body.slice(0, MAX_BODY_LEN);

  const now = Math.floor(Date.now() / 1000);
  if (!usedLegendum) {
    db.run(
      `UPDATE users SET
        quota_basic = quota_basic - (CASE WHEN quota_basic > 0 THEN 1 ELSE 0 END),
        quota_extra = quota_extra - (CASE WHEN quota_basic > 0 THEN 0 ELSE 1 END)
      WHERE id = ?`,
      webhookRow.user_id,
    );
  }
  db.run(
    "INSERT INTO webhook_events (webhook_id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
    webhookRow.id,
    webhookRow.user_id,
    title,
    body,
    now,
  );

  const fcmRows = db
    .query("SELECT fcm_token FROM fcm_tokens WHERE user_id = ?")
    .all(webhookRow.user_id) as { fcm_token: string }[];
  for (const row of fcmRows) {
    await sendFcmPush({
      fcmToken: row.fcm_token,
      title,
      body: body ?? undefined,
    });
  }

  if (emailPolicy === "each") {
    const config = getConfig();
    const notificationBox = renderNotificationBox(
      title,
      body,
      now,
      webhookRow.timezone,
      webhookRow.name,
    );
    try {
      await sendTemplatedEmail("alert", webhookRow.email, {
        app_name: config.app_name,
        notification_box: notificationBox,
        inbox_url: config.domain,
      });
    } catch (err) {
      log.error("Trigger: alert email failed", webhookRow.email, err);
    }
  }

  log.info("Trigger: delivered", {
    ulid: ulidParam,
    title: title?.slice(0, 50),
  });
  return json({ ok: true, title, body: body ?? null }, 202);
}
