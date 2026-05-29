import { formatTime } from "../lib/timeFormat.js";

export type AlertEventLike = {
  title: string | null;
  body: string | null;
  created_at: number;
  webhook_name?: string;
};

/** Client-side alert filter (title, body, formatted time, optional webhook name). */
export function alertEventMatchesFilter(
  event: AlertEventLike,
  query: string,
  timezone: string | null = null,
): boolean {
  const needle = query.toLowerCase();
  if (
    (event.title ?? "").toLowerCase().includes(needle) ||
    (event.body ?? "").toLowerCase().includes(needle) ||
    formatTime(event.created_at, timezone).toLowerCase().includes(needle)
  ) {
    return true;
  }
  return event.webhook_name?.toLowerCase().includes(needle) ?? false;
}
