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
  const maxDevices = 20;
  // Add or update this device's token so multiple devices get push (same fcm_token = same device, upsert)
  db.run(
    "INSERT OR REPLACE INTO fcm_tokens (token_hash, fcm_token) VALUES (?, ?)",
    tokenHash,
    fcmToken
  );
  const count = (db.query("SELECT COUNT(*) as n FROM fcm_tokens WHERE token_hash = ?").get(tokenHash) as { n: number }).n;
  if (count > maxDevices) {
    const oldest = db.query(
      "SELECT fcm_token FROM fcm_tokens WHERE token_hash = ? ORDER BY created_at ASC LIMIT ?"
    ).all(tokenHash, count - maxDevices) as { fcm_token: string }[];
    for (const row of oldest) {
      db.run("DELETE FROM fcm_tokens WHERE token_hash = ? AND fcm_token = ?", tokenHash, row.fcm_token);
    }
  }
  return json({ ok: true });
}
