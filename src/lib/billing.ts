import {
  chargeNamed,
  isBillingConfigured,
  isInsufficientFunds,
  isTokenInvalid,
} from "pues/base/billing/server";
import { isSelfHosted } from "pues/base/core";
import { getDb } from "./db.js";

function jsonError(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getUserToken(userId: number): string | null {
  const row = getDb()
    .query("SELECT legendum_token FROM users WHERE id = ?")
    .get(userId) as { legendum_token: string | null } | undefined;
  return row?.legendum_token ?? null;
}

function clearToken(userId: number): void {
  getDb().run("UPDATE users SET legendum_token = NULL WHERE id = ?", [userId]);
}

export type AlertTriggerBillingGate =
  | { allowed: true; usedLegendum: boolean }
  | { allowed: false; response: Response };

/**
 * Quota-first gate for `/w/:ulid` triggers. When free quota is exhausted,
 * charge via Pues billing (`billing.charges.alert_trigger` in
 * `config/pues.yaml`). Coupons stay in the quota lane only.
 */
export async function gateAlertTrigger(
  userId: number,
  quotaTotal: number,
): Promise<AlertTriggerBillingGate> {
  if (quotaTotal > 0) {
    return { allowed: true, usedLegendum: false };
  }

  if (isSelfHosted()) {
    return { allowed: true, usedLegendum: false };
  }

  if (!isBillingConfigured()) {
    return {
      allowed: false,
      response: jsonError(429, "quota_exceeded", "No quota"),
    };
  }

  const token = getUserToken(userId);
  if (!token) {
    return {
      allowed: false,
      response: jsonError(429, "quota_exceeded", "No quota"),
    };
  }

  const result = await chargeNamed({
    accountToken: token,
    name: "alert_trigger",
  });
  if (result.ok) {
    return { allowed: true, usedLegendum: true };
  }

  if (isInsufficientFunds(result)) {
    return {
      allowed: false,
      response: jsonError(429, "quota_exceeded", "No quota"),
    };
  }
  if (isTokenInvalid(result)) {
    clearToken(userId);
    return {
      allowed: false,
      response: jsonError(429, "quota_exceeded", "No quota"),
    };
  }

  console.error("Legendum alert_trigger charge failed", result.issue);
  return {
    allowed: false,
    response: jsonError(429, "quota_exceeded", "No quota"),
  };
}

/** Graceful shutdown hook (no tab billing in Alerting). */
export async function closeTabs(): Promise<void> {}
