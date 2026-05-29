import { describe, expect, test } from "bun:test";
import {
  encodeEventCursor,
  olderThanCursorSql,
  parseEventCursor,
} from "../src/lib/eventCursor.js";

describe("eventCursor", () => {
  test("parseEventCursor accepts created_at:id", () => {
    expect(parseEventCursor("1708012800:42")).toEqual({
      created_at: 1708012800,
      id: 42,
    });
  });

  test("parseEventCursor rejects invalid values", () => {
    expect(parseEventCursor(null)).toBeNull();
    expect(parseEventCursor("bad")).toBeNull();
    expect(parseEventCursor("1:0")).toBeNull();
  });

  test("encodeEventCursor round-trips", () => {
    const raw = encodeEventCursor(99, 7);
    expect(parseEventCursor(raw)).toEqual({ created_at: 99, id: 7 });
  });

  test("olderThanCursorSql uses composite comparison", () => {
    expect(olderThanCursorSql("e.created_at", "e.id")).toContain(
      "e.created_at < ?",
    );
    expect(olderThanCursorSql("created_at", "id")).toContain("id < ?");
  });
});
