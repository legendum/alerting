import { describe, expect, test } from "bun:test";
import {
  INBOX_WEBHOOK_PILL_COUNT,
  inboxWebhookPillIndex,
} from "../src/web/inboxWebhookPill";

describe("inboxWebhookPillIndex", () => {
  test("returns stable index in range for a ULID", () => {
    const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const a = inboxWebhookPillIndex(ulid);
    const b = inboxWebhookPillIndex(ulid);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(INBOX_WEBHOOK_PILL_COUNT);
  });

  test("different ULIDs can map to different indices", () => {
    const a = inboxWebhookPillIndex("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    const b = inboxWebhookPillIndex("01ARZ3NDEKTSV4RRFFQ69G5FAB");
    expect(a).not.toBe(b);
  });
});
