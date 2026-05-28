/**
 * Utility for rendering notification boxes in emails
 */
import { formatTime } from "./timeFormat.js";

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}
/**
 * Convert URLs in text to HTML links, then escape HTML while preserving links
 */
function linkifyUrls(text) {
  // Match http://, https:// URLs
  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  const parts = [];
  let lastIndex = 0;
  // Split text into text parts and URL parts
  let match;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex loop pattern is intentional
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "url", content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }
  // Build result: escape text parts, convert URL parts to links
  return parts
    .map((part) => {
      if (part.type === "url") {
        const escapedUrl = escapeHtml(part.content);
        return `<a href="${part.content}" style="color: #2563eb;">${escapedUrl}</a>`;
      } else {
        return escapeHtml(part.content);
      }
    })
    .join("");
}
/**
 * Render a notification box HTML for email
 */
export function renderNotificationBox(
  title,
  body,
  timestamp,
  timezone,
  webhookName,
) {
  const formattedTime = formatTime(timestamp, timezone);
  const escapedTitle = escapeHtml(title);
  const hasBody = body && body.trim().length > 0;
  const bodyText = hasBody ? body.trim() : "";
  // Linkify URLs and escape HTML in one pass
  const escapedBody = hasBody ? linkifyUrls(bodyText) : "";
  const escapedWebhookName = webhookName ? escapeHtml(webhookName) : "";
  const webhookNameHtml = escapedWebhookName
    ? `<div class="notification-webhook-name">${escapedWebhookName}</div>`
    : "";
  const separatorHtml = hasBody
    ? '<div class="notification-separator"></div>'
    : "";
  const bodyHtml = hasBody
    ? `<div class="notification-body">${escapedBody}</div>`
    : "";
  return `
<div class="notification-box">
  <div class="notification-header">
    <div class="notification-logo">🔴</div>
    ${webhookNameHtml}
    <div class="notification-time">${escapeHtml(formattedTime)}</div>
  </div>
  <div class="notification-title">${escapedTitle}</div>
  ${separatorHtml}
  ${bodyHtml}
</div>`.trim();
}
