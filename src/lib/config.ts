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
  /** Hour (0-23) to send daily digest emails in each user's timezone. Default: 8 (8am). */
  mail_hour?: number;
  coupon_prices?: CouponPrice[];
  smtp?: SmtpConfig;
  firebase?: {
    project_id: string;
    messaging_sender_id: string;
    api_key?: string;
    auth_domain?: string;
    storage_bucket?: string;
    app_id?: string;
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
  mail_hour: 8,
  coupon_prices: [
    { quota_extra: 200, price_cents: 200 },
    { quota_extra: 1000, price_cents: 500 },
  ],
};

let cached: Config | null = null;

/** Apply env vars starting with ALERT_ to config. e.g. ALERT_FIREBASE_PROJECT_ID → firebase.project_id */
function applyEnvOverrides(config: Config): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || !key.startsWith("ALERT_")) continue;
    const rest = key.slice(6);
    if (!rest) continue;
    const parts = rest.split("_").map((p) => p.toLowerCase());
    if (parts.length === 1) {
      (config as Record<string, unknown>)[parts[0]] = value;
      continue;
    }
    const [section, ...restParts] = parts;
    const subKey = restParts.join("_");
    if (section === "smtp") {
      if (!config.smtp) config.smtp = { host: "", port: 587, from: "" };
      (config.smtp as Record<string, unknown>)[subKey] = value;
    } else if (section === "firebase") {
      if (!config.firebase) config.firebase = { project_id: "", messaging_sender_id: "" };
      (config.firebase as Record<string, unknown>)[subKey] = value;
    } else {
      (config as Record<string, unknown>)[section] = value;
    }
  }
}

/** Load VAPID public/private keys from a JSON keypair file if path is set. */
function loadVapidKeypair(config: Config): void {
  const path = process.env.ALERT_FIREBASE_VAPID_KEYPAIR_PATH?.trim();
  if (!path || !config.firebase) return;
  if (config.firebase.vapid_public_key && config.firebase.vapid_private_key) return;
  try {
    const root = process.cwd();
    const raw = readFileSync(join(root, path), "utf-8");
    const pair = JSON.parse(raw) as { public_key?: string; private_key?: string };
    if (pair.public_key) config.firebase.vapid_public_key = pair.public_key;
    if (pair.private_key) config.firebase.vapid_private_key = pair.private_key;
  } catch {
    // ignore
  }
}

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
  applyEnvOverrides(cached);
  loadVapidKeypair(cached);
  if (process.env.NODE_ENV !== "production") {
    cached = { ...cached, domain: "http://localhost:3030" };
  }
  return cached;
}

export function getConfig(): Config {
  return cached ?? loadConfig();
}
