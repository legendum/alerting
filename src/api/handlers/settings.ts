import { getDb } from "../../lib/db.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import { loadConfig } from "../../lib/config.js";
import { createConfirmEmailToken } from "../../lib/confirmEmail.js";
import { log } from "../../lib/logger.js";
import { json } from "../json.js";

export function getMe(tokenHash: string): Response {
  const db = getDb();
  const row = db.query("SELECT email, email_new, timezone, quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(tokenHash) as { email: string; email_new: string | null; timezone: string | null; quota_basic: number; quota_extra: number } | undefined;
  if (!row) return json({ error: "not_found" }, 404);
  const out: { email: string; email_new?: string; timezone: string | null; quota_basic: number; quota_extra: number } = {
    email: row.email,
    timezone: row.timezone ?? null,
    quota_basic: row.quota_basic,
    quota_extra: row.quota_extra,
  };
  if (row.email_new) out.email_new = row.email_new;
  return json(out);
}

export async function patchMe(req: Request, tokenHash: string): Promise<Response> {
  let body: { timezone?: string };
  try {
    body = (await req.json()) as { timezone?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const db = getDb();
  if (body.timezone !== undefined) {
    db.run("UPDATE tokens SET timezone = ? WHERE token_hash = ?", body.timezone.trim() || null, tokenHash);
  }
  const row = db.query("SELECT email, email_new, timezone, quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(tokenHash) as { email: string; email_new: string | null; timezone: string | null; quota_basic: number; quota_extra: number };
  return json({
    email: row.email,
    ...(row.email_new && { email_new: row.email_new }),
    timezone: row.timezone ?? null,
    quota_basic: row.quota_basic,
    quota_extra: row.quota_extra,
  });
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function postChangeEmail(req: Request, tokenHash: string): Promise<Response> {
  let body: { email_new?: string };
  try {
    body = (await req.json()) as { email_new?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const emailNew = body.email_new?.trim();
  if (!emailNew || !EMAIL_REGEX.test(emailNew)) {
    return json({ error: "invalid_request", message: "Valid email is required" }, 400);
  }
  const db = getDb();
  const row = db.query("SELECT email, email_new FROM tokens WHERE token_hash = ?").get(tokenHash) as { email: string; email_new: string | null } | undefined;
  if (!row) return json({ error: "not_found" }, 404);
  if (row.email.toLowerCase() === emailNew.toLowerCase()) {
    return json({ error: "invalid_request", message: "New email is the same as current email" }, 400);
  }
  const other = db.query("SELECT 1 FROM tokens WHERE LOWER(email) = LOWER(?) AND token_hash != ?").get(emailNew, tokenHash);
  if (other) {
    return json({ error: "invalid_request", message: "That email is already in use" }, 400);
  }
  db.run("UPDATE tokens SET email_new = ? WHERE token_hash = ?", emailNew, tokenHash);
  const config = loadConfig();
  const confirmToken = createConfirmEmailToken(tokenHash, emailNew);
  const confirmUrl = `${config.domain}/auth/confirm-email?token=${encodeURIComponent(confirmToken)}`;
  try {
    await sendTemplatedEmail("confirm-email", emailNew, { app_name: config.app_name, confirm_url: confirmUrl });
  } catch (err) {
    log.error("Failed to send confirm-email", emailNew, err);
    // Still record email_new; user can retry or use a new link later
  }
  return json({ ok: true, email_new: emailNew });
}

export async function redeemCoupon(req: Request, tokenHash: string): Promise<Response> {
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
    "UPDATE coupons SET token_hash = ?, redeemed_at = ? WHERE id = ? AND token_hash IS NULL",
    tokenHash,
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
    "UPDATE tokens SET quota_extra = quota_extra + ? WHERE token_hash = ?",
    amount,
    tokenHash
  );
  const row = db.query("SELECT quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(tokenHash) as { quota_basic: number; quota_extra: number };
  return json({ quota_basic: row.quota_basic, quota_extra: row.quota_extra });
}
