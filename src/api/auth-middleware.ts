import { getDb } from "../lib/db.js";
import { getTokenFromRequest, hashToken } from "../lib/auth.js";
import { json } from "./json.js";

/**
 * Returns token_hash for the authenticated user, or null if not authenticated or inactive.
 */
export function getAuthTokenHash(req: Request): string | null {
  const plain = getTokenFromRequest(req);
  if (!plain) return null;
  const tokenHash = hashToken(plain);
  const db = getDb();
  const row = db.query("SELECT 1 FROM tokens WHERE token_hash = ? AND status = 'active'").get(tokenHash);
  return row ? tokenHash : null;
}

export function requireAuth(req: Request): { tokenHash: string } | Response {
  const tokenHash = getAuthTokenHash(req);
  if (!tokenHash) {
    return json({ error: "unauthorized", message: "Not authenticated" }, 401);
  }
  return { tokenHash };
}
