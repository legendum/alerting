import { getDb } from "../../lib/db.js";
import { json } from "../json.js";
export async function registerPush(req, userId) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const fcmToken = body.fcmToken?.trim();
  if (!fcmToken)
    return json(
      { error: "invalid_request", message: "fcmToken is required" },
      400,
    );
  const db = getDb();
  const maxDevices = 20;
  db.run(
    "INSERT OR REPLACE INTO fcm_tokens (user_id, fcm_token) VALUES (?, ?)",
    [userId, fcmToken],
  );
  const count = db
    .query("SELECT COUNT(*) as n FROM fcm_tokens WHERE user_id = ?")
    .get(userId).n;
  if (count > maxDevices) {
    const oldest = db
      .query(
        "SELECT fcm_token FROM fcm_tokens WHERE user_id = ? ORDER BY created_at ASC LIMIT ?",
      )
      .all(userId, count - maxDevices);
    for (const row of oldest) {
      db.run("DELETE FROM fcm_tokens WHERE user_id = ? AND fcm_token = ?", [
        userId,
        row.fcm_token,
      ]);
    }
  }
  return json({ ok: true });
}
