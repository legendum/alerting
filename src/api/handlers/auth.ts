import { getDb } from "../../lib/db.js";
import { hashToken, setAuthCookieHeader, clearAuthCookieHeader } from "../../lib/auth.js";
import { sendTemplatedEmail } from "../../lib/email.js";
import { loadConfig } from "../../lib/config.js";
import { ulid } from "../../lib/ulid.js";
import { json } from "../json.js";

export async function postRequestLink(req: Request): Promise<Response> {
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
    db.run("UPDATE tokens SET token_hash = ?, status = ? WHERE email = ?", tokenHash, "pending", email);
    db.run("UPDATE webhooks SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
    db.run("UPDATE webhook_events SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
    db.run("UPDATE fcm_tokens SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
    db.run("UPDATE coupons SET token_hash = ? WHERE token_hash = ?", tokenHash, oldHash);
  } else {
    db.run(
      "INSERT INTO tokens (token_hash, email, status) VALUES (?, ?, 'pending')",
      tokenHash,
      email
    );
  }
  const appName = loadConfig().app_name;
  try {
    await sendTemplatedEmail("login-link", email, {
      app_name: appName,
      verify_url: verifyUrl,
    });
  } catch {
    // When email can't be sent (e.g. dev), return the link so the client can show it
  }
  const payload: { ok: boolean; login_link?: string; token?: string } = { ok: true };
  if (process.env.NODE_ENV !== "production") {
    payload.login_link = verifyUrl;
    payload.token = plainToken;
  }
  return json(payload);
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
  // Stub: in a real app we'd verify a signed token or look up in a table; for now we don't have confirm tokens in schema
  // Placeholder: redirect to app with success
  const config = loadConfig();
  return Response.redirect(config.domain + "/?email_confirmed=1", 302);
}
