import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

let testDb: Database;

function freshDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  const schema = readFileSync(
    join(import.meta.dir, "../config/schema.sql"),
    "utf-8",
  );
  db.exec(schema);
  return db;
}

// Mock db module
mock.module("../src/lib/db.js", () => ({
  getDb: () => testDb,
}));

// Mock config module
mock.module("../src/lib/config.js", () => ({
  loadConfig: () => ({
    domain: "http://localhost:3000",
    db_path: ":memory:",
    app_name: "Alerting.app",
    mail_hour: 8,
    cookie_secret: "test-secret",
  }),
  getConfig: () => ({
    domain: "http://localhost:3000",
    db_path: ":memory:",
    app_name: "Alerting.app",
    mail_hour: 8,
    cookie_secret: "test-secret",
  }),
}));

// Mock email
const mockSendTemplatedEmail = mock(() => Promise.resolve());
mock.module("../src/lib/email.js", () => ({
  sendTemplatedEmail: mockSendTemplatedEmail,
}));

// Mock FCM
const mockSendFcmPush = mock(() => Promise.resolve());
mock.module("../src/lib/fcm.js", () => ({
  sendFcmPush: mockSendFcmPush,
}));

// Mock logger
mock.module("../src/lib/logger.js", () => ({
  log: { info: () => {}, warn: () => {}, error: () => {} },
}));

// Mock legendum SDK using built-in mock support
// @ts-ignore — pure JS SDK
const legendum = require("../src/lib/legendum.js");
const mockCharge = mock(() => Promise.resolve({ transaction_id: 1, balance: 0 }));
const mockExchangeCode = mock(() => Promise.resolve({ email: "test@example.com", linked: false }));
legendum.mock({
  charge: (...args: any[]) => mockCharge(...args),
  exchangeCode: (...args: any[]) => mockExchangeCode(...args),
});

// Mock emailNotification
mock.module("../src/lib/emailNotification.js", () => ({
  renderNotificationBox: () => "<div>notification</div>",
}));

// Now import handlers (after mocks are set up)
import { createSessionCookie, verifySessionCookie, getUserIdFromRequest } from "../src/lib/auth.js";
import * as eventHandlers from "../src/api/handlers/events.js";
import * as settingsHandlers from "../src/api/handlers/settings.js";
import * as pushHandlers from "../src/api/handlers/push.js";
import * as triggerHandlers from "../src/api/handlers/trigger.js";
import * as authHandlers from "../src/api/handlers/auth.js";
import { requireAuth } from "../src/api/auth-middleware.js";
import {
  createWebhookResourceRoutes,
  dispatchRouteMap,
} from "../src/api/webhookResource.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertUser(email = "alice@example.com"): number {
  testDb.run("INSERT INTO users (email, quota_reset) VALUES (?, strftime('%s', 'now'))", email);
  return (testDb.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
}

function insertWebhook(userId: number, name = "Test webhook"): string {
  const ulid = `WH${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  testDb.run(
    "INSERT INTO webhooks (user_id, ulid, name, policy) VALUES (?, ?, ?, ?)",
    userId, ulid, name, JSON.stringify({ email_schedule: "never", retention_days: 7 })
  );
  return ulid;
}

function insertEvent(webhookId: number, userId: number, title = "Test alert"): number {
  const wRow = testDb.query("SELECT id FROM webhooks WHERE ulid = ?").get(webhookId) as { id: number } | undefined;
  const wId = typeof webhookId === "number" && wRow ? wRow.id : webhookId;
  testDb.run(
    "INSERT INTO webhook_events (webhook_id, user_id, title, body, created_at) VALUES (?, ?, ?, 'body', strftime('%s', 'now'))",
    wId, userId, title
  );
  return (testDb.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;
}

function insertEventByUlid(ulid: string, userId: number, title = "Test alert"): number {
  const wRow = testDb.query("SELECT id FROM webhooks WHERE ulid = ?").get(ulid) as { id: number };
  testDb.run(
    "INSERT INTO webhook_events (webhook_id, user_id, title, body, created_at) VALUES (?, ?, ?, 'body', strftime('%s', 'now'))",
    wRow.id, userId, title
  );
  return (testDb.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;
}

function jsonReq(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authedReq(
  userId: number,
  url: string,
  opts: { body?: unknown; method?: string } = {},
): Request {
  const cookie = createSessionCookie(userId);
  const headers: Record<string, string> = {
    Cookie: `alert_session=${encodeURIComponent(cookie)}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

async function dispatchWebhookApi(req: Request): Promise<Response> {
  const routes = await createWebhookResourceRoutes();
  const res = await dispatchRouteMap(routes, req);
  if (!res) throw new Error(`No route matched ${req.method} ${req.url}`);
  return res;
}

async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

// ---------------------------------------------------------------------------
// Reset DB before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  testDb = freshDb();
  mockSendTemplatedEmail.mockClear();
  mockSendFcmPush.mockClear();
  mockCharge.mockClear();
});

// ===========================================================================
// Auth (unit)
// ===========================================================================

describe("auth cookies", () => {
  test("round-trip create and verify", () => {
    const cookie = createSessionCookie(42);
    const userId = verifySessionCookie(cookie);
    expect(userId).toBe(42);
  });

  test("expired cookie returns null", () => {
    // Manually craft an expired cookie
    const { createHmac } = require("crypto");
    const secret = "test-secret";
    const expires = Date.now() - 1000; // already expired
    const payload = `42:${expires}`;
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    expect(verifySessionCookie(`${payload}:${sig}`)).toBeNull();
  });

  test("tampered signature returns null", () => {
    const cookie = createSessionCookie(42);
    const tampered = cookie.slice(0, -3) + "xxx";
    expect(verifySessionCookie(tampered)).toBeNull();
  });

  test("malformed cookie returns null", () => {
    expect(verifySessionCookie("garbage")).toBeNull();
    expect(verifySessionCookie("")).toBeNull();
    expect(verifySessionCookie("a:b:c:d")).toBeNull();
  });

  test("getUserIdFromRequest extracts from cookie header", () => {
    const cookie = createSessionCookie(7);
    const req = new Request("http://localhost/", {
      headers: { Cookie: `alert_session=${encodeURIComponent(cookie)}` },
    });
    expect(getUserIdFromRequest(req)).toBe(7);
  });

  test("getUserIdFromRequest returns null without cookie", () => {
    const req = new Request("http://localhost/");
    expect(getUserIdFromRequest(req)).toBeNull();
  });
});

// ===========================================================================
// Auth middleware
// ===========================================================================

describe("requireAuth", () => {
  test("valid cookie for existing user returns userId", () => {
    const userId = insertUser();
    const cookie = createSessionCookie(userId);
    const req = new Request("http://localhost/", {
      headers: { Cookie: `alert_session=${encodeURIComponent(cookie)}` },
    });
    const result = requireAuth(req);
    expect(result).toEqual({ userId });
  });

  test("valid cookie for deleted user returns 401", async () => {
    const cookie = createSessionCookie(9999);
    const req = new Request("http://localhost/", {
      headers: { Cookie: `alert_session=${encodeURIComponent(cookie)}` },
    });
    const result = requireAuth(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });

  test("no cookie returns 401", async () => {
    const req = new Request("http://localhost/");
    const result = requireAuth(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

// ===========================================================================
// Auth handlers
// ===========================================================================

describe("auth handlers", () => {
  test("getLogin redirects to Legendum", () => {
    const req = new Request("http://localhost:3000/auth/login");
    const res = authHandlers.getLogin(req);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("auth/authorize");
    expect(res.headers.get("Set-Cookie")).toContain("alert_oauth_state=");
  });

  test("getCallback rejects missing code", async () => {
    const req = new Request("http://localhost:3000/auth/callback?state=abc");
    const res = await authHandlers.getCallback(req);
    expect(res.status).toBe(400);
  });

  test("getCallback rejects state mismatch", async () => {
    const req = new Request("http://localhost:3000/auth/callback?code=abc&state=wrong", {
      headers: { Cookie: "alert_oauth_state=correct" },
    });
    const res = await authHandlers.getCallback(req);
    expect(res.status).toBe(400);
    const body = await jsonBody(res);
    expect(body.error).toBe("invalid_state");
  });

  test("postLogout clears cookie", async () => {
    const res = await authHandlers.postLogout();
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});

// ===========================================================================
// Pues webhooks resource
// ===========================================================================

describe("/api/webhooks resource", () => {
  test("creates webhook rows with canonical Pues wire shape", async () => {
    const userId = insertUser();
    const res = await dispatchWebhookApi(
      authedReq(userId, "http://localhost/api/webhooks", {
        body: { label: " My hook ", description: " desc " },
      }),
    );

    expect(res.status).toBe(201);
    const body = await jsonBody(res);
    expect(body.id).toBeTruthy();
    expect(body.label).toBe("My hook");
    expect(body.description).toBe("desc");
    expect(body.position).toBe(1000);
    expect(JSON.parse(body.policy).email_schedule).toBe("never");
  });

  test("lists only the authenticated user's webhooks", async () => {
    const alice = insertUser("alice@example.com");
    const bob = insertUser("bob@example.com");
    insertWebhook(alice, "Alice hook");
    insertWebhook(bob, "Bob hook");

    const res = await dispatchWebhookApi(
      authedReq(alice, "http://localhost/api/webhooks"),
    );
    const body = await jsonBody(res);

    expect(body).toHaveLength(1);
    expect(body[0].label).toBe("Alice hook");
  });

  test("updates label, description, and policy", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const res = await dispatchWebhookApi(
      authedReq(userId, `http://localhost/api/webhooks/${ulid}`, {
        method: "PATCH",
        body: {
          label: "Updated",
          description: "",
          policy: { email_schedule: "daily", retention_days: 14 },
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.label).toBe("Updated");
    expect(body.description).toBeNull();
    expect(JSON.parse(body.policy)).toEqual({
      email_schedule: "daily",
      retention_days: 14,
    });
  });

  test("filters by configured contains columns", async () => {
    const userId = insertUser();
    insertWebhook(userId, "Alpha hook");
    insertWebhook(userId, "Beta hook");

    const res = await dispatchWebhookApi(
      authedReq(userId, "http://localhost/api/webhooks?name=alp"),
    );
    const body = await jsonBody(res);

    expect(body).toHaveLength(1);
    expect(body[0].label).toBe("Alpha hook");
  });

  test("reorders webhooks with before anchor", async () => {
    const userId = insertUser();
    const firstRes = await dispatchWebhookApi(
      authedReq(userId, "http://localhost/api/webhooks", {
        body: { label: "First" },
      }),
    );
    const secondRes = await dispatchWebhookApi(
      authedReq(userId, "http://localhost/api/webhooks", {
        body: { label: "Second" },
      }),
    );
    const first = await jsonBody(firstRes);
    const second = await jsonBody(secondRes);

    const reorderRes = await dispatchWebhookApi(
      authedReq(userId, `http://localhost/api/webhooks/${second.id}`, {
        method: "PATCH",
        body: { before: first.id },
      }),
    );
    expect(reorderRes.status).toBe(200);

    const listRes = await dispatchWebhookApi(
      authedReq(userId, "http://localhost/api/webhooks"),
    );
    const rows = await jsonBody(listRes);
    expect(rows.map((row: { label: string }) => row.label)).toEqual([
      "Second",
      "First",
    ]);
  });

  test("rejects cross-user update and delete", async () => {
    const alice = insertUser("alice@example.com");
    const bob = insertUser("bob@example.com");
    const ulid = insertWebhook(alice, "Alice hook");

    const patchRes = await dispatchWebhookApi(
      authedReq(bob, `http://localhost/api/webhooks/${ulid}`, {
        method: "PATCH",
        body: { label: "Stolen" },
      }),
    );
    expect(patchRes.status).toBe(404);

    const deleteRes = await dispatchWebhookApi(
      authedReq(bob, `http://localhost/api/webhooks/${ulid}`, {
        method: "DELETE",
      }),
    );
    expect(deleteRes.status).toBe(404);
  });
});

// ===========================================================================
// Events
// ===========================================================================

describe("events", () => {
  test("list all events", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    insertEventByUlid(ulid, userId, "Alert 1");
    insertEventByUlid(ulid, userId, "Alert 2");
    const req = new Request("http://localhost/alerts");
    const res = eventHandlers.listAllEvents(req, userId);
    const body = await jsonBody(res);
    expect(body.events).toHaveLength(2);
    expect(body.total_unread).toBe(2);
  });

  test("list events respects limit", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    for (let i = 0; i < 5; i++) insertEventByUlid(ulid, userId, `Alert ${i}`);
    const req = new Request("http://localhost/alerts?limit=2");
    const res = eventHandlers.listAllEvents(req, userId);
    const body = await jsonBody(res);
    expect(body.events).toHaveLength(2);
    expect(body.has_more).toBe(true);
  });

  test("list events user isolation", async () => {
    const alice = insertUser("alice@example.com");
    const bob = insertUser("bob@example.com");
    const ulidA = insertWebhook(alice);
    const ulidB = insertWebhook(bob);
    insertEventByUlid(ulidA, alice, "Alice alert");
    insertEventByUlid(ulidB, bob, "Bob alert");
    const req = new Request("http://localhost/alerts");
    const res = eventHandlers.listAllEvents(req, alice);
    const body = await jsonBody(res);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].title).toBe("Alice alert");
  });

  test("mark events seen", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const eventId = insertEventByUlid(ulid, userId);
    const req = jsonReq("http://localhost/alerts/seen", { event_ids: [eventId] }, "PUT");
    const res = await eventHandlers.putAllEventsSeen(req, userId);
    expect(res.status).toBe(200);
    // Verify read_at is set
    const row = testDb.query("SELECT read_at FROM webhook_events WHERE id = ?").get(eventId) as { read_at: number | null };
    expect(row.read_at).not.toBeNull();
  });

  test("list webhook events 404 for wrong user", () => {
    const alice = insertUser("alice@example.com");
    const bob = insertUser("bob@example.com");
    const ulid = insertWebhook(alice);
    const req = new Request("http://localhost/webhooks/" + ulid + "/events");
    const res = eventHandlers.listWebhookEvents(req, ulid, bob);
    expect(res.status).toBe(404);
  });

  test("patch event read/unread", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const eventId = insertEventByUlid(ulid, userId);
    // Mark as read
    const req1 = jsonReq(`http://localhost/webhooks/${ulid}/events/${eventId}`, { read: true }, "PATCH");
    const res1 = await eventHandlers.patchEvent(req1, ulid, String(eventId), userId);
    expect(res1.status).toBe(200);
    const body1 = await jsonBody(res1);
    expect(body1.read_at).not.toBeNull();
    // Mark as unread
    const req2 = jsonReq(`http://localhost/webhooks/${ulid}/events/${eventId}`, { read: false }, "PATCH");
    const res2 = await eventHandlers.patchEvent(req2, ulid, String(eventId), userId);
    const body2 = await jsonBody(res2);
    expect(body2.read_at).toBeNull();
  });

  test("delete event", () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const eventId = insertEventByUlid(ulid, userId);
    const res = eventHandlers.deleteEvent(ulid, String(eventId), userId);
    expect(res.status).toBe(204);
  });

  test("delete event 404 for wrong webhook", () => {
    const userId = insertUser();
    const ulid1 = insertWebhook(userId, "Hook 1");
    const ulid2 = insertWebhook(userId, "Hook 2");
    const eventId = insertEventByUlid(ulid1, userId);
    const res = eventHandlers.deleteEvent(ulid2, String(eventId), userId);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Trigger
// ===========================================================================

describe("trigger", () => {
  test("server route keeps public /w/:ulid trigger contract", async () => {
    const { default: server } = await import("../src/api/server.js");
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const req = jsonReq(`http://localhost:3000/w/${ulid}`, {
      title: "Route smoke",
      body: "still works",
    }) as Request & { params?: Record<string, string> };
    req.params = { ulid };

    const triggerRoute = (
      server as {
        routes: Record<string, Record<string, (req: Request) => Promise<Response>>>;
      }
    ).routes["/w/:ulid"]?.POST;
    if (!triggerRoute) throw new Error("Missing /w/:ulid POST route");
    const res = await triggerRoute(req);
    expect(res.status).toBe(202);

    const row = testDb
      .query(
        "SELECT title, body FROM webhook_events WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(userId) as { title: string; body: string } | undefined;
    expect(row?.title).toBe("Route smoke");
    expect(row?.body).toBe("still works");
  });

  test("fires webhook and creates event", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const req = jsonReq(`http://localhost:3000/w/${ulid}`, { title: "Hello", body: "World" });
    const res = await triggerHandlers.triggerWebhook(req, ulid);
    expect(res.status).toBe(202);
    const body = await jsonBody(res);
    expect(body.ok).toBe(true);
    expect(body.title).toBe("Hello");
    // Event created
    const events = testDb.query("SELECT * FROM webhook_events WHERE user_id = ?").all(userId);
    expect(events).toHaveLength(1);
  });

  test("decrements quota_basic", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const before = (testDb.query("SELECT quota_basic FROM users WHERE id = ?").get(userId) as { quota_basic: number }).quota_basic;
    const req = new Request(`http://localhost:3000/w/${ulid}`);
    await triggerHandlers.triggerWebhook(req, ulid);
    const after = (testDb.query("SELECT quota_basic FROM users WHERE id = ?").get(userId) as { quota_basic: number }).quota_basic;
    expect(after).toBe(before - 1);
  });

  test("falls through to quota_extra when quota_basic is 0", async () => {
    const userId = insertUser();
    testDb.run("UPDATE users SET quota_basic = 0, quota_extra = 10 WHERE id = ?", userId);
    const ulid = insertWebhook(userId);
    const req = new Request(`http://localhost:3000/w/${ulid}`);
    await triggerHandlers.triggerWebhook(req, ulid);
    const row = testDb.query("SELECT quota_basic, quota_extra FROM users WHERE id = ?").get(userId) as { quota_basic: number; quota_extra: number };
    expect(row.quota_basic).toBe(0);
    expect(row.quota_extra).toBe(9);
  });

  test("falls through to Legendum when both quotas 0", async () => {
    const userId = insertUser();
    testDb.run("UPDATE users SET quota_basic = 0, quota_extra = 0, legendum_token = 'tok_test' WHERE id = ?", userId);
    const ulid = insertWebhook(userId);
    const req = new Request(`http://localhost:3000/w/${ulid}`);
    const res = await triggerHandlers.triggerWebhook(req, ulid);
    expect(res.status).toBe(202);
    expect(mockCharge).toHaveBeenCalled();
    // Quota should not be decremented (Legendum was charged)
    const row = testDb.query("SELECT quota_basic, quota_extra FROM users WHERE id = ?").get(userId) as { quota_basic: number; quota_extra: number };
    expect(row.quota_basic).toBe(0);
    expect(row.quota_extra).toBe(0);
  });

  test("returns 429 when all quota exhausted", async () => {
    const userId = insertUser();
    testDb.run("UPDATE users SET quota_basic = 0, quota_extra = 0 WHERE id = ?", userId);
    const ulid = insertWebhook(userId);
    const req = new Request(`http://localhost:3000/w/${ulid}`);
    const res = await triggerHandlers.triggerWebhook(req, ulid);
    expect(res.status).toBe(429);
  });

  test("404 for nonexistent webhook", async () => {
    const req = new Request("http://localhost:3000/w/NONEXISTENT");
    const res = await triggerHandlers.triggerWebhook(req, "NONEXISTENT");
    expect(res.status).toBe(404);
  });

  test("sends email when policy is each", async () => {
    const userId = insertUser();
    const ulid = `WH${Date.now()}`;
    testDb.run(
      "INSERT INTO webhooks (user_id, ulid, name, policy) VALUES (?, ?, 'Email hook', ?)",
      userId, ulid, JSON.stringify({ email_schedule: "each" })
    );
    const req = new Request(`http://localhost:3000/w/${ulid}?title=urgent`);
    await triggerHandlers.triggerWebhook(req, ulid);
    expect(mockSendTemplatedEmail).toHaveBeenCalled();
  });

  test("sends FCM push", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    testDb.run("INSERT INTO fcm_tokens (user_id, fcm_token) VALUES (?, 'fcm_abc')", userId);
    const req = new Request(`http://localhost:3000/w/${ulid}?title=ping`);
    await triggerHandlers.triggerWebhook(req, ulid);
    expect(mockSendFcmPush).toHaveBeenCalled();
  });

  test("reads title and body from query params", async () => {
    const userId = insertUser();
    const ulid = insertWebhook(userId);
    const req = new Request(`http://localhost:3000/w/${ulid}?title=QT&body=QB`);
    const res = await triggerHandlers.triggerWebhook(req, ulid);
    const body = await jsonBody(res);
    expect(body.title).toBe("QT");
    expect(body.body).toBe("QB");
  });
});

// ===========================================================================
// Settings
// ===========================================================================

describe("settings", () => {
  test("getMe returns user fields", async () => {
    const userId = insertUser();
    const res = settingsHandlers.getMe(userId);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.email).toBe("alice@example.com");
    expect(body.quota_basic).toBe(100);
    expect(body.legendum_linked).toBe(false);
  });

  test("getMe 404 for nonexistent user", () => {
    const res = settingsHandlers.getMe(9999);
    expect(res.status).toBe(404);
  });

  test("getMe shows legendum_linked when token set", async () => {
    const userId = insertUser();
    testDb.run("UPDATE users SET legendum_token = 'tok_test' WHERE id = ?", userId);
    const res = settingsHandlers.getMe(userId);
    const body = await jsonBody(res);
    expect(body.legendum_linked).toBe(true);
  });

  test("patchMe updates timezone", async () => {
    const userId = insertUser();
    const req = jsonReq("http://localhost/settings/me", { timezone: "Europe/London" }, "PATCH");
    const res = await settingsHandlers.patchMe(req, userId);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.timezone).toBe("Europe/London");
  });

  test("redeem coupon adds quota", async () => {
    const userId = insertUser();
    testDb.run("INSERT INTO coupons (id, quota_extra) VALUES ('COUPON1', 50)");
    const req = jsonReq("http://localhost/settings/redeem-coupon", { coupon_id: "COUPON1" });
    const res = await settingsHandlers.redeemCoupon(req, userId);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.quota_extra).toBe(50);
  });

  test("redeem coupon prevents double redeem", async () => {
    const userId = insertUser();
    testDb.run("INSERT INTO coupons (id, quota_extra) VALUES ('COUPON2', 50)");
    const req1 = jsonReq("http://localhost/settings/redeem-coupon", { coupon_id: "COUPON2" });
    await settingsHandlers.redeemCoupon(req1, userId);
    const req2 = jsonReq("http://localhost/settings/redeem-coupon", { coupon_id: "COUPON2" });
    const res2 = await settingsHandlers.redeemCoupon(req2, userId);
    expect(res2.status).toBe(400);
    const body = await jsonBody(res2);
    expect(body.message).toContain("already redeemed");
  });

  test("redeem coupon 404 for nonexistent", async () => {
    const userId = insertUser();
    const req = jsonReq("http://localhost/settings/redeem-coupon", { coupon_id: "NOPE" });
    const res = await settingsHandlers.redeemCoupon(req, userId);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Push
// ===========================================================================

describe("push", () => {
  test("registers FCM token", async () => {
    const userId = insertUser();
    const req = jsonReq("http://localhost/push/register", { fcmToken: "fcm_token_123" });
    const res = await pushHandlers.registerPush(req, userId);
    expect(res.status).toBe(200);
    const row = testDb.query("SELECT * FROM fcm_tokens WHERE user_id = ?").get(userId);
    expect(row).toBeTruthy();
  });

  test("rejects missing fcmToken", async () => {
    const userId = insertUser();
    const req = jsonReq("http://localhost/push/register", {});
    const res = await pushHandlers.registerPush(req, userId);
    expect(res.status).toBe(400);
  });

  test("prunes oldest tokens beyond 20 devices", async () => {
    const userId = insertUser();
    // Insert 20 tokens
    for (let i = 0; i < 20; i++) {
      testDb.run("INSERT INTO fcm_tokens (user_id, fcm_token) VALUES (?, ?)", userId, `token_${i}`);
    }
    // Register 21st
    const req = jsonReq("http://localhost/push/register", { fcmToken: "token_new" });
    await pushHandlers.registerPush(req, userId);
    const count = (testDb.query("SELECT COUNT(*) as n FROM fcm_tokens WHERE user_id = ?").get(userId) as { n: number }).n;
    expect(count).toBe(20);
  });
});
