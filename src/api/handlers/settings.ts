import { getDb } from "../../lib/db.js";
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
  const coupon = db.query("SELECT quota_basic, quota_extra FROM coupons WHERE id = ?").get(couponId) as { quota_basic: number; quota_extra: number };
  db.run(
    "UPDATE tokens SET quota_basic = quota_basic + ?, quota_extra = quota_extra + ? WHERE token_hash = ?",
    coupon.quota_basic,
    coupon.quota_extra,
    tokenHash
  );
  const row = db.query("SELECT quota_basic, quota_extra FROM tokens WHERE token_hash = ?").get(tokenHash) as { quota_basic: number; quota_extra: number };
  return json({ quota_basic: row.quota_basic, quota_extra: row.quota_extra });
}
