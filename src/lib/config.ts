import { parse } from "yaml";
import { readFileSync } from "fs";
import { join } from "path";

export type CouponPrice = { quota_extra: number; price_cents: number };

export type SmtpConfig = {
  host: string;
  port: number;
  secure?: boolean; // true for 465, false for STARTTLS on 25/587
  user?: string;
  password?: string;
  /** From address e.g. "Alert <noreply@alerting.app>" */
  from: string;
};

export type Config = {
  domain: string;
  db_path: string;
  /** App name used in UI and page titles (e.g. "Alert" or "alerting.app"). */
  app_name: string;
  coupon_prices?: CouponPrice[];
  smtp?: SmtpConfig;
  firebase?: {
    project_id: string;
    messaging_sender_id: string;
    vapid_public_key?: string;
    vapid_private_key?: string;
    service_account_path?: string;
  };
  cookie_secret?: string; // for encrypting the auth cookie; default dev key if missing
};

const defaultConfig: Config = {
  domain: "http://localhost:3030",
  db_path: "data/alert.db",
  app_name: "Alert",
  coupon_prices: [
    { quota_extra: 200, price_cents: 200 },
    { quota_extra: 1000, price_cents: 500 },
  ],
};

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const root = process.cwd();
  const path = join(root, "config", "alert.yaml");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw) as Partial<Config>;
    cached = { ...defaultConfig, ...parsed };
  } catch {
    cached = { ...defaultConfig };
  }
  if (process.env.NODE_ENV !== "production") {
    cached = { ...cached, domain: "http://localhost:3030" };
  }
  return cached;
}

export function getConfig(): Config {
  return cached ?? loadConfig();
}
