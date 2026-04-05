import { createHmac } from "node:crypto";
import { getConfig } from "./config.js";

const COOKIE_NAME = "alert_session";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function getSecret(): string {
  return (
    getConfig().cookie_secret ??
    process.env.COOKIE_SECRET ??
    "dev-secret-change-in-production"
  );
}

export function createSessionCookie(userId: number): string {
  const expires = Date.now() + MAX_AGE * 1000;
  const payload = `${userId}:${expires}`;
  const sig = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}:${sig}`;
}

export function verifySessionCookie(cookie: string): number | null {
  const parts = cookie.split(":");
  if (parts.length !== 3) return null;
  const [userIdStr, expiresStr, sig] = parts;
  const payload = `${userIdStr}:${expiresStr}`;
  const expected = createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
  if (sig !== expected) return null;
  if (Date.now() > parseInt(expiresStr, 10)) return null;
  return parseInt(userIdStr, 10);
}

export function getUserIdFromRequest(req: Request): number | null {
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionCookie(decodeURIComponent(match[1]));
}

export function setAuthCookieHeader(userId: number): string {
  const value = encodeURIComponent(createSessionCookie(userId));
  const config = getConfig();
  const isSecure = config.domain.startsWith("https://");
  const secureFlag = isSecure ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secureFlag}`;
}

export function clearAuthCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME };
