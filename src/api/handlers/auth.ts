import { getDb } from "../../lib/db.js";
import { hashToken, setAuthCookieHeader, clearAuthCookieHeader } from "../../lib/auth.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import { loadConfig } from "../../lib/config.js";
import { ulid } from "../../lib/ulid.js";
import { verifyConfirmEmailToken } from "../../lib/confirmEmail.js";
import { log } from "../../lib/logger.js";
import { json } from "../json.js";

export async function postRequestLink(req: Request): Promise<Response> {
  try {
    let body: { email?: string };
    try {
      body = (await req.json()) as { email?: string };
    } catch {
      return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
    }
    const email = body.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_request", message: "Invalid email" }, 400);
    }
    const db = getDb();
    const existing = db.query("SELECT token_hash, status FROM tokens WHERE email = ?").get(email) as { token_hash: string; status: string } | undefined;
    const plainToken = ulid() + ulid();
    const tokenHash = hashToken(plainToken);
    const config = loadConfig();
    const verifyUrl = `${config.domain}/auth/verify?token=${encodeURIComponent(plainToken)}`;
    if (existing) {
      const oldHash = existing.token_hash;
      // Defer FK checks so we can change token_hash (PK) then update child tables in one transaction
      db.run("BEGIN TRANSACTION");
      db.run("PRAGMA defer_foreign_keys = ON");
      try {
        db.run("UPDATE tokens SET token_hash = ?, status = ? WHERE email = ?", tokenHash, "pending", email);
        db.run("UPDATE webhooks SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
        db.run("UPDATE webhook_events SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
        db.run("UPDATE fcm_tokens SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
        db.run("UPDATE coupons SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
        db.run("COMMIT");
      } catch (e) {
        db.run("ROLLBACK");
        throw e;
      }
    } else {
      db.run(
        "INSERT INTO tokens (token_hash, email, status, quota_reset) VALUES (?, ?, 'pending', strftime('%s', 'now'))",
        tokenHash,
        email
      );
      const defaultPolicy = JSON.stringify({ email_schedule: "never", retention_days: 7 });
      db.run(
        "INSERT INTO webhooks (token_hash, ulid, name, description, policy) VALUES (?, ?, 'My default webhook', NULL, ?)",
        tokenHash,
        ulid(),
        defaultPolicy
      );
    }
    try {
      await sendTemplatedEmail("login-link", email, { app_name: config.app_name, verify_url: verifyUrl });
    } catch (err) {
      log.error("Failed to send login email", err);
      const payload = {
        error: "email_failed",
        message: "We couldn't send the login email. Check server logs for details.",
        ...(process.env.NODE_ENV !== "production" && { login_link: verifyUrl, token: plainToken }),
      };
      return json(payload, 503);
    }
    const payload: { ok: boolean; login_link?: string; token?: string } = { ok: true };
    if (process.env.NODE_ENV !== "production") {
      payload.login_link = verifyUrl;
      payload.token = plainToken;
    }
    return json(payload);
  } catch (err) {
    log.error("postRequestLink error", err);
    const message =
      process.env.NODE_ENV !== "production" && err instanceof Error
        ? err.message
        : "Something went wrong. Check server logs.";
    return json({ error: "server_error", message }, 500);
  }
}

export async function getVerify(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  return verifyTokenAndRespond(req, token);
}

export async function postVerify(req: Request): Promise<Response> {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const token = body.token?.trim();
  return verifyTokenAndRespond(req, token);
}

async function verifyTokenAndRespond(req: Request, token: string | null | undefined): Promise<Response> {
  if (!token) return json({ error: "invalid_request", message: "Missing token" }, 400);
  const tokenHash = hashToken(token);
  const db = getDb();
  const row = db.query("SELECT status FROM tokens WHERE token_hash = ?").get(tokenHash) as { status: string } | undefined;
  if (!row) return json({ error: "not_found", message: "Token not found" }, 404);
  if (row.status === "inactive") return json({ error: "not_found", message: "Token inactive" }, 404);
  db.run("UPDATE tokens SET status = 'active' WHERE token_hash = ?", tokenHash);
  const setCookie = setAuthCookieHeader(token);
  const config = loadConfig();
  const accept = req?.headers?.get?.("Accept") ?? "";
  if (req?.method === "GET" && !accept.includes("application/json")) {
    return new Response(null, {
      status: 302,
      headers: { "Location": config.domain + "/", "Set-Cookie": setCookie },
    });
  }
  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": setCookie },
  });
}

export async function postLogout(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearAuthCookieHeader(),
    },
  });
}

export async function getConfirmEmail(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const confirmToken = url.searchParams.get("token")?.trim();
  if (!confirmToken) return json({ error: "invalid_request", message: "Missing token" }, 400);
  const payload = verifyConfirmEmailToken(confirmToken);
  const config = loadConfig();
  if (!payload) return Response.redirect(config.domain + "/?email_confirm=invalid", 302);
  const { tokenHash, emailNew } = payload;
  const db = getDb();
  const row = db.query("SELECT email_new FROM tokens WHERE token_hash = ?").get(tokenHash) as { email_new: string | null } | undefined;
  if (!row || row.email_new !== emailNew) return Response.redirect(config.domain + "/?email_confirm=invalid", 302);
  db.run("UPDATE tokens SET email = ?, email_new = NULL WHERE token_hash = ?", emailNew, tokenHash);
  return Response.redirect(config.domain + "/?email_confirmed=1", 302);
}
