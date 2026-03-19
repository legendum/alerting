import { getConfig } from "./config.js";
import { log } from "./logger.js";

// @ts-ignore — pure JS SDK
const sdk = require("./legendum.js");

let client: ReturnType<typeof sdk.create> | null = null;

function getClient() {
  if (client) return client;
  try {
    client = sdk.create();
  } catch {
    return null;
  }
  return client;
}

export async function chargeCredits(
  accountToken: string,
  amount: number,
  description: string,
  idempotencyKey: string
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: "not_configured" };
  try {
    const data = await c.charge(accountToken, amount, description, { key: idempotencyKey });
    return { ok: true, balance: data.balance };
  } catch (err: any) {
    log.error("Legendum charge failed", err.code ?? err.message);
    return { ok: false, error: err.code ?? "charge_failed" };
  }
}

export async function getBalance(
  accountToken: string
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: "not_configured" };
  try {
    const data = await c.balance(accountToken);
    return { ok: true, balance: data.balance };
  } catch (err: any) {
    log.error("Legendum balance check failed", err.code ?? err.message);
    return { ok: false, error: err.code ?? "balance_failed" };
  }
}

export async function requestLink(): Promise<{ ok: boolean; code?: string; requestId?: string; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: "not_configured" };
  try {
    const data = await c.requestLink();
    return { ok: true, code: data.code, requestId: data.request_id };
  } catch (err: any) {
    log.error("Legendum requestLink failed", err.code ?? err.message);
    return { ok: false, error: err.code ?? "link_failed" };
  }
}

export async function pollLink(requestId: string): Promise<{ ok: boolean; status?: string; accountToken?: string; error?: string }> {
  const c = getClient();
  if (!c) return { ok: false, error: "not_configured" };
  try {
    const data = await c.pollLink(requestId);
    return { ok: true, status: data.status, accountToken: data.account_token };
  } catch (err: any) {
    log.error("Legendum pollLink failed", err.code ?? err.message);
    return { ok: false, error: err.code ?? "poll_failed" };
  }
}

export function isConfigured(): boolean {
  return !!getClient();
}
