/** Pastel pill palette size for All Alerts webhook names (see `.inbox-webhook-pill--*`). */
export const INBOX_WEBHOOK_PILL_COUNT = 8;

/** Stable color index per webhook ULID. */
export function inboxWebhookPillIndex(webhookUlid: string): number {
  let h = 0;
  for (let i = 0; i < webhookUlid.length; i++) {
    h = (Math.imul(31, h) + webhookUlid.charCodeAt(i)) >>> 0;
  }
  return h % INBOX_WEBHOOK_PILL_COUNT;
}
