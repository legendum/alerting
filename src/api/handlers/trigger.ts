import { getDb } from "../../lib/db.js";
import { sendFcmPush } from "../../lib/fcm.js";
import { json } from "../json.js";

const MAX_TITLE_LEN = 256;
const MAX_BODY_LEN = 1024;

function isBasicPolicy(policyJson: string | null): boolean {
  if (!policyJson || policyJson.trim() === "") return true;
  try {
    const p = JSON.parse(policyJson) as { retention_days?: number | string; email?: string };
    const retentionBasic = p.retention_days === undefined || p.retention_days === 7 || Number(p.retention_days) === 7;
    const emailBasic = p.email === undefined || p.email === "never";
    return retentionBasic && emailBasic;
  } catch {
    return true;
  }
}

export async function triggerWebhook(req: Request, ulidParam: string): Promise<Response> {
  const db = getDb();
  const webhook = db.query(`
    SELECT w.id, w.token_hash, w.policy FROM webhooks w
    WHERE w.ulid = ?
  `).get(ulidParam) as { id: number; token_hash: string; policy: string | null } | undefined;
  if (!webhook) return json({ error: "not_found", message: "Webhook not found" }, 404);

  const token = db.query("SELECT quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(webhook.token_hash) as { quota_basic: number; quota_extra: number } | undefined;
  if (!token) return json({ error: "not_found" }, 404);

  const useBasic = isBasicPolicy(webhook.policy);
  if (useBasic && token.quota_basic <= 0) return json({ error: "quota_exceeded", message: "No basic quota" }, 429);
  if (!useBasic && token.quota_extra <= 0) return json({ error: "quota_exceeded", message: "No extra quota" }, 429);

  let title = "You have an alert";
  let body: string | null = null;
  const url = new URL(req.url);
  const qTitle = url.searchParams.get("title");
  const qBody = url.searchParams.get("body");
  if (qTitle != null) title = qTitle;
  if (qBody != null) body = qBody;
  try {
    const payload = (await req.json()) as { title?: string; body?: string };
    if (payload?.title) title = String(payload.title);
    if (payload?.body != null) body = String(payload.body);
  } catch {
    // GET or empty body – already applied query params above
  }

  if (title.length > MAX_TITLE_LEN) title = title.slice(0, MAX_TITLE_LEN);
  if (body != null && body.length > MAX_BODY_LEN) body = body.slice(0, MAX_BODY_LEN);

  const now = Math.floor(Date.now() / 1000);
  db.run(
    "UPDATE tokens SET quota_basic = quota_basic - ?, quota_extra = quota_extra - ? WHERE token_hash = ?",
    useBasic ? 1 : 0,
    useBasic ? 0 : 1,
    webhook.token_hash
  );
  db.run(
    "INSERT INTO webhook_events (webhook_id, token_hash, title, body, created_at) VALUES (?, ?, ?, ?, ?)",
    webhook.id,
    webhook.token_hash,
    title,
    body,
    now
  );

  const fcmRows = db.query("SELECT fcm_token FROM fcm_tokens WHERE token_hash = ?").all(webhook.token_hash) as { fcm_token: string }[];
  for (const row of fcmRows) {
    await sendFcmPush({ fcmToken: row.fcm_token, title, body: body ?? undefined });
  }

  return json({ ok: true, title, body: body ?? null }, 202);
}
