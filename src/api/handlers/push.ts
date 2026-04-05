import { getDb } from "../../lib/db.js";
import { json } from "../json.js";

export async function registerPush(
  req: Request,
  userId: number,
): Promise<Response> {
  let body: { fcmToken?: string };
  try {
    body = (await req.json()) as { fcmToken?: string };
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
    userId,
    fcmToken,
  );
  const count = (
    db
      .query("SELECT COUNT(*) as n FROM fcm_tokens WHERE user_id = ?")
      .get(userId) as { n: number }
  ).n;
  if (count > maxDevices) {
    const oldest = db
      .query(
        "SELECT fcm_token FROM fcm_tokens WHERE user_id = ? ORDER BY created_at ASC LIMIT ?",
      )
      .all(userId, count - maxDevices) as { fcm_token: string }[];
    for (const row of oldest) {
      db.run(
        "DELETE FROM fcm_tokens WHERE user_id = ? AND fcm_token = ?",
        userId,
        row.fcm_token,
      );
    }
  }
  return json({ ok: true });
}
