import { createHash } from "crypto";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { getConfig } from "./config.js";

const COOKIE_NAME = "alert_session";
const SALT = "alert-cookie-v1";

function getSecret(): Buffer {
  const secret = getConfig().cookie_secret ?? process.env.COOKIE_SECRET ?? "dev-secret-change-in-production";
  return scryptSync(secret, SALT, 32);
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function encryptCookie(plain: string): string {
  const key = getSecret();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return iv.toString("base64url") + "." + enc.toString("base64url");
}

export function decryptCookie(encoded: string): string | null {
  try {
    const [ivB64, encB64] = encoded.split(".");
    if (!ivB64 || !encB64) return null;
    const key = getSecret();
    const iv = Buffer.from(ivB64, "base64url");
    const enc = Buffer.from(encB64, "base64url");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return decipher.update(enc).toString("utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = req.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return decryptCookie(decodeURIComponent(match[1]));
}

export function setAuthCookieHeader(token: string): string {
  const value = encodeURIComponent(encryptCookie(token));
  const config = getConfig();
  const isSecure = config.domain.startsWith("https://");
  const secureFlag = isSecure ? "; Secure" : "";
  // Max-Age: 10 years (315360000 seconds) for very persistent sessions
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=315360000${secureFlag}`;
}

export function clearAuthCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export { COOKIE_NAME };
