import { getDb } from "../../lib/db.js";
import { getConfig } from "../../lib/config.js";
import { json } from "../json.js";

export function getMe(userId: number): Response {
  const db = getDb();
  const row = db.query("SELECT email, timezone, quota_basic, quota_extra, quota_reset, legendum_token FROM users WHERE id = ?").get(userId) as { email: string; timezone: string | null; quota_basic: number; quota_extra: number; quota_reset: number | null; legendum_token: string | null } | undefined;
  if (!row) return json({ error: "not_found" }, 404);
  const config = getConfig();
  return json({
    email: row.email,
    timezone: row.timezone ?? null,
    quota_basic: row.quota_basic,
    quota_extra: row.quota_extra,
    quota_reset: row.quota_reset ?? null,
    mail_hour: config.mail_hour ?? 8,
    legendum_linked: !!row.legendum_token,
  });
}

export async function patchMe(req: Request, userId: number): Promise<Response> {
  let body: { timezone?: string };
  try {
    body = (await req.json()) as { timezone?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const db = getDb();
  if (body.timezone !== undefined) {
    db.run("UPDATE users SET timezone = ? WHERE id = ?", body.timezone.trim() || null, userId);
  }
  const row = db.query("SELECT email, timezone, quota_basic, quota_extra FROM users WHERE id = ?").get(userId) as { email: string; timezone: string | null; quota_basic: number; quota_extra: number };
  return json({
    email: row.email,
    timezone: row.timezone ?? null,
    quota_basic: row.quota_basic,
    quota_extra: row.quota_extra,
  });
}

export async function redeemCoupon(req: Request, userId: number): Promise<Response> {
  let body: { coupon_id?: string };
  try {
    body = (await req.json()) as { coupon_id?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const couponId = body.coupon_id?.trim();
  if (!couponId) return json({ error: "invalid_request", message: "coupon_id is required" }, 400);
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const updateRedeem = db.run(
    "UPDATE coupons SET user_id = ?, redeemed_at = ? WHERE id = ? AND user_id IS NULL",
    userId,
    now,
    couponId
  );
  if (updateRedeem.changes === 0) {
    const exists = db.query("SELECT 1 FROM coupons WHERE id = ?").get(couponId);
    return json(
      { error: exists ? "invalid_request" : "not_found", message: exists ? "Coupon already redeemed" : "Coupon not found" },
      exists ? 400 : 404
    );
  }
  const coupon = db.query("SELECT quota_extra FROM coupons WHERE id = ?").get(couponId) as { quota_extra: number };
  const amount = coupon.quota_extra;
  db.run(
    "UPDATE users SET quota_extra = quota_extra + ? WHERE id = ?",
    amount,
    userId
  );
  const row = db.query("SELECT quota_basic, quota_extra FROM users WHERE id = ?").get(userId) as { quota_basic: number; quota_extra: number };
  return json({ quota_basic: row.quota_basic, quota_extra: row.quota_extra });
}

export async function setupPipedAlias(req: Request, userId: number): Promise<Response> {
  let body: { webhook_url?: string; piped_api_key?: string };
  try {
    body = (await req.json()) as { webhook_url?: string; piped_api_key?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const webhookUrl = body.webhook_url?.trim();
  const pipedApiKey = body.piped_api_key?.trim();
  if (!webhookUrl || !pipedApiKey) {
    return json({ error: "invalid_request", message: "webhook_url and piped_api_key are required" }, 400);
  }
  const { log } = await import("../../lib/logger.js");
  const aliasCommand = `alias alert=curl -X POST -d "title=\\$1" -d "body=\\$2" ${webhookUrl}`;
  try {
    const res = await fetch("https://piped.sh/", {
      method: "POST",
      headers: {
        "X-API-Key": pipedApiKey,
        "Content-Type": "text/plain",
      },
      body: aliasCommand,
    });
    if (res.ok) {
      return json({ ok: true });
    } else {
      const text = await res.text().catch(() => "");
      return json({ error: "piped_error", message: text || "Failed to configure alias" }, res.status);
    }
  } catch (err) {
    log.error("Failed to connect to piped.sh", err);
    return json({ error: "connection_error", message: "Failed to connect to piped.sh" }, 500);
  }
}
