import { getDb } from "../../lib/db.js";
import { json } from "../json.js";

export async function registerPush(req: Request, tokenHash: string): Promise<Response> {
  let body: { fcmToken?: string };
  try {
    body = (await req.json()) as { fcmToken?: string };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const fcmToken = body.fcmToken?.trim();
  if (!fcmToken) return json({ error: "invalid_request", message: "fcmToken is required" }, 400);
  const db = getDb();
  db.run(
    "INSERT OR REPLACE INTO fcm_tokens (token_hash, fcm_token) VALUES (?, ?)",
    tokenHash,
    fcmToken
  );
  return json({ ok: true });
}
