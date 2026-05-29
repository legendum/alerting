import type { Row } from "pues/base/objects";

/** Wire row for `useResource("webhooks")` — `id` is the public ULID; `slug` is the URL path. */
export type WebhookEntry = Row<{
  slug: string;
  policy?: string | { email_schedule?: string; retention_days?: number };
}>;
