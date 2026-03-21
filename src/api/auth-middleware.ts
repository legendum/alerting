import { getDb } from "../lib/db.js";
import { getUserIdFromRequest } from "../lib/auth.js";
import { json } from "./json.js";

export function getAuthUserId(req: Request): number | null {
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const db = getDb();
  const row = db.query("SELECT 1 FROM users WHERE id = ?").get(userId);
  return row ? userId : null;
}

export function requireAuth(req: Request): { userId: number } | Response {
  const userId = getAuthUserId(req);
  if (!userId) {
    return json({ error: "unauthorized", message: "Not authenticated" }, 401);
  }
  return { userId };
}
