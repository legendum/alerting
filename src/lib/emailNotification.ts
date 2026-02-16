/**
 * Utility for rendering notification boxes in emails
 */

import { formatTime } from "./timeFormat.js";

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Render a notification box HTML for email
 */
export function renderNotificationBox(
  title: string,
  body: string | null,
  timestamp: number,
  timezone: string | null
): string {
  const formattedTime = formatTime(timestamp, timezone);
  const escapedTitle = escapeHtml(title);
  const escapedBody = body ? escapeHtml(body) : "";
  const bodyHtml = escapedBody ? `<div class="notification-body">${escapedBody}</div>` : "";

  return `
<div class="notification-box">
  <div class="notification-header">
    <div class="notification-time">${escapeHtml(formattedTime)}</div>
    <div class="notification-logo">🔴</div>
  </div>
  <div class="notification-title">${escapedTitle}</div>
  ${escapedBody ? '<div class="notification-separator"></div>' : ""}
  ${bodyHtml}
</div>`.trim();
}
