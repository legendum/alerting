import type { Row } from "pues/base/objects";

/** Wire row for `useResource("webhooks")` — `id` is the public ULID. */
export type WebhookEntry = Row<{
  description?: string | null;
  policy?: string | { email_schedule?: string; retention_days?: number };
}>;
