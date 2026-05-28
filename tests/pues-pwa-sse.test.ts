import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { mountPwaRoutes } from "pues/base/pwa/server";
import { puesSse } from "../src/api/puesSse.js";

const root = join(import.meta.dir, "..");

describe("pues SSE", () => {
  test("exposes authenticated stream at /api/events", () => {
    expect(puesSse.routes["/api/events"]?.GET).toBeDefined();
    expect(typeof puesSse.broadcast).toBe("function");
  });
});

describe("pues PWA", () => {
  test("mountPwaRoutes registers manifest, sw, and yaml icons", async () => {
    const pwa = await mountPwaRoutes({ root });
    expect(pwa.routes["/manifest.json"]).toBeDefined();
    expect(pwa.routes["/dist/sw.js"]).toBeDefined();
    expect(pwa.routes["/img/inbox-192.png"]).toBeDefined();
    expect(pwa.routes["/img/inbox-512.png"]).toBeDefined();
  });

  test("built sw imports Firebase hooks when present", () => {
    const swPath = join(root, "public/dist/sw.js");
    if (!existsSync(swPath)) return;
    const sw = readFileSync(swPath, "utf8");
    expect(sw).toContain("alerting-sw-hooks.js");
  });

  test("hooks script includes background FCM handler", () => {
    const hooksPath = join(root, "src/web/alerting-sw-hooks.js");
    const js = readFileSync(hooksPath, "utf8");
    expect(js).toContain("onBackgroundMessage");
    expect(js).toContain("__FIREBASE_CONFIG__");
  });
});
