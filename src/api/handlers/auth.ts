import { clearAuthCookieHeader, setAuthCookieHeader } from "../../lib/auth.js";
import { loadConfig } from "../../lib/config.js";
import { getDb } from "../../lib/db.js";
import { log } from "../../lib/logger.js";
import { ulid } from "../../lib/ulid.js";
import { json } from "../json.js";

const legendum = require("../../lib/legendum.js");

export function getLogin(req: Request): Response {
  const config = loadConfig();
  const state = crypto.randomUUID();
  const redirectUri = `${config.domain}/auth/callback`;
  const url = legendum.authUrl({ redirectUri, state });

  // Store state in a short-lived cookie for CSRF protection
  const stateCookie = `alert_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": stateCookie,
    },
  });
}

export async function getCallback(req: Request): Promise<Response> {
  const config = loadConfig();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return json(
      { error: "invalid_request", message: "Missing code or state" },
      400,
    );
  }

  // Verify CSRF state
  const cookie = req.headers.get("Cookie") ?? "";
  const stateMatch = cookie.match(/alert_oauth_state=([^;]+)/);
  const savedState = stateMatch?.[1];
  if (state !== savedState) {
    return json({ error: "invalid_state", message: "State mismatch" }, 400);
  }

  const redirectUri = `${config.domain}/auth/callback`;

  let data: {
    email: string;
    linked: boolean;
    account_token?: string;
  };
  try {
    data = (await legendum.exchangeCode(code, redirectUri)) as typeof data;
  } catch (err: unknown) {
    log.error("Legendum code exchange failed", err);
    return json({ error: "auth_failed", message: "Login failed" }, 400);
  }

  const email = data.email?.trim();
  if (!email) {
    return json(
      { error: "auth_failed", message: "Login response missing email" },
      400,
    );
  }

  const db = getDb();
  const legendumToken = data.account_token;

  let user = db.query("SELECT id FROM users WHERE email = ?").get(email) as {
    id: number;
  } | null;

  if (!user) {
    db.run(
      "INSERT INTO users (email, quota_reset) VALUES (?, strftime('%s', 'now'))",
      email,
    );
    user = db.query("SELECT id FROM users WHERE email = ?").get(email) as {
      id: number;
    };

    const defaultPolicy = JSON.stringify({
      email_schedule: "never",
      retention_days: 7,
    });
    db.run(
      "INSERT INTO webhooks (user_id, ulid, name, description, policy) VALUES (?, ?, 'My default webhook', NULL, ?)",
      user.id,
      ulid(),
      defaultPolicy,
    );
  } else {
    db.run("UPDATE users SET email = ? WHERE id = ?", email, user.id);
  }

  if (legendumToken) {
    db.run(
      "UPDATE users SET legendum_token = ? WHERE id = ?",
      legendumToken,
      user.id,
    );
  }

  const sessionCookie = setAuthCookieHeader(user.id);
  const clearState =
    "alert_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";

  return new Response(null, {
    status: 302,
    headers: [
      ["Location", `${config.domain}/`],
      ["Set-Cookie", sessionCookie],
      ["Set-Cookie", clearState],
    ] as [string, string][],
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
