import { getUnreadSnapshot } from "../lib/unreadCounts.js";
import { puesSse } from "./puesSse.js";

/** Push fresh unread counts to the user's SSE stream (and poll listeners). */
export function broadcastAlertsUnread(userId: number): void {
  const snapshot = getUnreadSnapshot(userId);
  puesSse.broadcast(userId, "alerts.updated", snapshot, { op_id: null });
}
