/** URL path segment for a webhook detail page (`/:slug`). */
export const RESERVED_WEBHOOK_SLUGS = new Set([
  "api",
  "pues",
  "w",
  "dist",
  "webhooks",
  "alerts",
  "push",
  "settings",
  "inbox",
]);

export function toWebhookSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isReservedWebhookSlug(slug: string): boolean {
  return RESERVED_WEBHOOK_SLUGS.has(slug);
}

/** Returns null if valid, or an error message. */
export function validateWebhookLabel(label: string): string | null {
  if (!label || label.trim().length === 0) return "Name is required";
  if (label.length > 100) return "Name is too long";
  const slug = toWebhookSlug(label);
  if (!slug) return "Name must contain at least one letter or number";
  if (isReservedWebhookSlug(slug)) return `"${label}" is a reserved name`;
  return null;
}
