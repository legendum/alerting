import type { AlertEventWire } from "../lib/alertEventWire.js";
import { getUnreadSnapshot } from "../lib/unreadCounts.js";
import { puesSse } from "./puesSse.js";

/** Push fresh unread counts to the user's SSE stream (and poll listeners). */
export function broadcastAlertsUnread(userId: number): void {
  const snapshot = getUnreadSnapshot(userId);
  puesSse.broadcast(userId, "alerts.updated", snapshot, { op_id: null });
}

/** Notify connected clients of a new alert (includes unread snapshot). */
export function broadcastAlertCreated(
  userId: number,
  event: AlertEventWire,
): void {
  const unread = getUnreadSnapshot(userId);
  puesSse.broadcast(
    userId,
    "alerts.created",
    {
      event,
      total_unread: unread.total_unread,
      unread_by_webhook: unread.unread_by_webhook,
    },
    { op_id: null },
  );
}
