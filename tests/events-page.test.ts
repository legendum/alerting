import { describe, expect, test } from "bun:test";
import { pageEventsAsc } from "../src/lib/eventsPage.js";

describe("pageEventsAsc", () => {
  test("reverses a DESC page and reports has_more", () => {
    const rows = [
      { id: 3, created_at: 30 },
      { id: 2, created_at: 20 },
      { id: 1, created_at: 10 },
    ];
    const { events, hasMore } = pageEventsAsc(rows, 2);
    expect(hasMore).toBe(true);
    expect(events.map((r) => r.id)).toEqual([2, 3]);
  });

  test("returns full page when no extra row", () => {
    const rows = [
      { id: 2, created_at: 20 },
      { id: 1, created_at: 10 },
    ];
    const { events, hasMore } = pageEventsAsc(rows, 2);
    expect(hasMore).toBe(false);
    expect(events.map((r) => r.id)).toEqual([1, 2]);
  });
});
