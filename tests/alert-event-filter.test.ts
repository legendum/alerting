import { describe, expect, test } from "bun:test";
import { alertEventMatchesFilter } from "../src/web/eventFilter";

describe("alertEventMatchesFilter", () => {
  const event = {
    title: "Deploy finished",
    body: "build #42 passed",
    created_at: 1_700_000_000,
    webhook_name: "CI",
  };

  test("matches title", () => {
    expect(alertEventMatchesFilter(event, "deploy")).toBe(true);
  });

  test("matches body", () => {
    expect(alertEventMatchesFilter(event, "build")).toBe(true);
  });

  test("matches webhook name on inbox rows", () => {
    expect(alertEventMatchesFilter(event, "ci")).toBe(true);
  });

  test("returns false when nothing matches", () => {
    expect(alertEventMatchesFilter(event, "zzznomatch")).toBe(false);
  });
});
