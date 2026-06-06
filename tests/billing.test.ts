import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { setByLegendum } from "pues/base/core/mode";
import { createTempDb, type TempDb } from "pues/base/test/server";

const TEST_DB_PATH = "data/test-billing.db";

let tdb: TempDb;
let billing: typeof import("../src/lib/billing");
let getDb: typeof import("pues/base/db/server").getDb;
// biome-ignore lint/suspicious/noExplicitAny: legendum SDK is plain JS
let legendum: any;

let userId: number;
let userIdNoToken: number;

type ChargeCall = { token: string; amount: number; description: string };

let chargeCalls: ChargeCall[];
// biome-ignore lint/suspicious/noExplicitAny: SDK error shape is dynamic
let nextChargeError: any | null = null;

beforeAll(async () => {
  // Hosted mode so charge paths run — createTempDb unsets the Legendum creds,
  // so re-set them via `env` (applied after the unset).
  tdb = createTempDb({
    dbPath: TEST_DB_PATH,
    env: { LEGENDUM_API_KEY: "lpk_test", LEGENDUM_SECRET: "lsk_test" },
  });

  legendum = require("../pues/base/auth/legendum.js");
  billing = await import("../src/lib/billing");
  getDb = tdb.getDb;

  legendum.mock({
    charge: async (token: string, amount: number, description: string) => {
      chargeCalls.push({ token, amount, description });
      if (nextChargeError) {
        const err = nextChargeError;
        nextChargeError = null;
        throw err;
      }
      return { email: "mock@test.com", transaction_id: 1, balance: 100 };
    },
  });

  const u1 = getDb().run(
    "INSERT INTO users (email, legendum_token, quota_basic, quota_extra) VALUES (?, ?, 0, 0)",
    "billed@test",
    "tok_user_1",
  );
  userId = Number(u1.lastInsertRowid);

  const u2 = getDb().run(
    "INSERT INTO users (email, legendum_token, quota_basic, quota_extra) VALUES (?, ?, 0, 0)",
    "unlinked@test",
    null,
  );
  userIdNoToken = Number(u2.lastInsertRowid);
});

afterAll(async () => {
  legendum.unmock();
  await billing.closeTabs();
  tdb.stop();
});

beforeEach(() => {
  chargeCalls = [];
  nextChargeError = null;
});

describe("gateAlertTrigger", () => {
  test("uses free quota without billing", async () => {
    const gate = await billing.gateAlertTrigger(userId, 5);
    expect(gate).toEqual({ allowed: true, usedLegendum: false });
    expect(chargeCalls).toEqual([]);
  });

  test("charges alert_trigger when quota is exhausted", async () => {
    const gate = await billing.gateAlertTrigger(userId, 0);
    expect(gate).toEqual({ allowed: true, usedLegendum: true });
    expect(chargeCalls).toEqual([
      { token: "tok_user_1", amount: 1, description: "alerting.app alert" },
    ]);
  });

  test("returns 429 when quota exhausted and user has no token", async () => {
    const gate = await billing.gateAlertTrigger(userIdNoToken, 0);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.response.status).toBe(429);
      const body = (await gate.response.json()) as { error: string };
      expect(body.error).toBe("quota_exceeded");
    }
    expect(chargeCalls).toEqual([]);
  });

  test("returns 429 on insufficient_funds", async () => {
    nextChargeError = Object.assign(new Error("low"), {
      code: "insufficient_funds",
      status: 402,
    });
    const gate = await billing.gateAlertTrigger(userId, 0);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.response.status).toBe(429);
      const body = (await gate.response.json()) as { error: string };
      expect(body.error).toBe("quota_exceeded");
    }
  });

  test("clears token on token_not_found", async () => {
    nextChargeError = Object.assign(new Error("gone"), {
      code: "token_not_found",
      status: 404,
    });
    const gate = await billing.gateAlertTrigger(userId, 0);
    expect(gate.allowed).toBe(false);
    const row = getDb()
      .query("SELECT legendum_token FROM users WHERE id = ?")
      .get(userId) as { legendum_token: string | null };
    expect(row.legendum_token).toBeNull();

    getDb().run("UPDATE users SET legendum_token = ? WHERE id = ?", [
      "tok_user_1",
      userId,
    ]);
  });

  test("self-hosted mode allows triggers without billing when quota is 0", async () => {
    setByLegendum(false);
    try {
      const gate = await billing.gateAlertTrigger(userId, 0);
      expect(gate).toEqual({ allowed: true, usedLegendum: false });
      expect(chargeCalls).toEqual([]);
    } finally {
      setByLegendum(null);
    }
  });
});
