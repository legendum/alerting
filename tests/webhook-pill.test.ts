import { describe, expect, test } from "bun:test";
import {
  WEBHOOK_PILL_COUNT,
  webhookPillClassNames,
  webhookPillIndex,
} from "../src/web/webhookPill";

describe("webhookPillIndex", () => {
  test("returns stable index in range for a ULID", () => {
    const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const a = webhookPillIndex(ulid);
    const b = webhookPillIndex(ulid);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(WEBHOOK_PILL_COUNT);
  });

  test("different ULIDs can map to different indices", () => {
    const a = webhookPillIndex("01ARZ3NDEKTSV4RRFFQ69G5FAV");
    const b = webhookPillIndex("01ARZ3NDEKTSV4RRFFQ69G5FAB");
    expect(a).not.toBe(b);
  });
});

describe("webhookPillClassNames", () => {
  test("includes base classes and extras", () => {
    const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const cls = webhookPillClassNames(ulid, "webhook-pill--header");
    expect(cls).toContain("webhook-pill");
    expect(cls).toContain(`webhook-pill--${webhookPillIndex(ulid)}`);
    expect(cls).toContain("webhook-pill--header");
  });
});
