/**
 * Time formatting utilities using user's timezone preference
 */

/**
 * Format a Unix timestamp (seconds since epoch) using the user's timezone preference.
 * Falls back to server's local timezone if no timezone is provided.
 */
export function formatTime(ts: number, timezone: string | null): string {
  const d = new Date(ts * 1000);
  const tz = timezone && timezone.trim() ? timezone : undefined;
  return d.toLocaleString(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
