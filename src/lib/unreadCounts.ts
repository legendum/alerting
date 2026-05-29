import { getDb } from "./db.js";

const SEVEN_DAYS_SEC = 7 * 24 * 3600;

export type UnreadSnapshot = {
  total_unread: number;
  unread_by_webhook: Record<string, number>;
};

/** Unread counts for events in the last 7 days (matches `GET /alerts`). */
export function getUnreadSnapshot(userId: number): UnreadSnapshot {
  const db = getDb();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SEC;
  const countRows = db
    .query(`
      SELECT e.read_at, w.ulid AS webhook_ulid
      FROM webhook_events e
      JOIN webhooks w ON w.id = e.webhook_id
      WHERE e.user_id = ? AND e.created_at >= ?
    `)
    .all(userId, sevenDaysAgo) as {
    read_at: number | null;
    webhook_ulid: string;
  }[];

  let totalUnread = 0;
  const unreadByWebhook: Record<string, number> = {};
  for (const r of countRows) {
    if (r.read_at == null) {
      totalUnread++;
      unreadByWebhook[r.webhook_ulid] =
        (unreadByWebhook[r.webhook_ulid] ?? 0) + 1;
    }
  }
  return { total_unread: totalUnread, unread_by_webhook: unreadByWebhook };
}
