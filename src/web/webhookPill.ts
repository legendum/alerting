/** Pastel pill palette size (see `.webhook-pill--*` in main.css). */
export const WEBHOOK_PILL_COUNT = 8;

/** Stable color index per webhook ULID. */
export function webhookPillIndex(webhookUlid: string): number {
  let h = 0;
  for (let i = 0; i < webhookUlid.length; i++) {
    h = (Math.imul(31, h) + webhookUlid.charCodeAt(i)) >>> 0;
  }
  return h % WEBHOOK_PILL_COUNT;
}

/** Class names for a webhook pill (`webhook-pill webhook-pill--N` + optional extras). */
export function webhookPillClassNames(
  webhookUlid: string,
  ...extra: string[]
): string {
  const base = `webhook-pill webhook-pill--${webhookPillIndex(webhookUlid)}`;
  return extra.length > 0 ? `${base} ${extra.join(" ")}` : base;
}
