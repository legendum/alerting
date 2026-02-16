import { createHmac, scryptSync } from "crypto";
import { getConfig } from "./config.js";

const SALT = "alert-confirm-email-v1";
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

function getSecret(): Buffer {
  const secret = getConfig().cookie_secret ?? process.env.COOKIE_SECRET ?? "dev-secret-change-in-production";
  return scryptSync(secret, SALT, 32);
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlDecode(str: string): Buffer | null {
  try {
    return Buffer.from(str, "base64url");
  } catch {
    return null;
  }
}

/**
 * Create a signed token for the confirm-email link. Payload: tokenHash:emailNew:expiry.
 */
export function createConfirmEmailToken(tokenHash: string, emailNew: string): string {
  const expiry = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = `${tokenHash}:${emailNew}:${expiry}`;
  const key = getSecret();
  const sig = createHmac("sha256", key).update(payload).digest();
  return b64urlEncode(Buffer.from(payload, "utf8")) + "." + b64urlEncode(sig);
}

/**
 * Verify the token and return tokenHash and emailNew, or null if invalid/expired.
 */
export function verifyConfirmEmailToken(token: string): { tokenHash: string; emailNew: string } | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const payloadBuf = b64urlDecode(payloadB64);
  const sigBuf = b64urlDecode(sigB64);
  if (!payloadBuf || !sigBuf) return null;
  const payload = payloadBuf.toString("utf8");
  const key = getSecret();
  const expectedSig = createHmac("sha256", key).update(payload).digest();
  if (expectedSig.length !== sigBuf.length || !expectedSig.equals(sigBuf)) return null;
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  const [tokenHash, emailNew, expiryStr] = parts;
  const expiry = parseInt(expiryStr!, 10);
  if (Number.isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return null;
  if (!tokenHash || !emailNew) return null;
  return { tokenHash, emailNew };
}
