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

export function isConfigured(): boolean {
  return !!getClient();
}
