import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const defaultConfig = {
  domain: "http://localhost:3030",
  db_path: "data/alert.db",
  app_name: "Alert",
  mail_hour: 8,
  coupon_prices: [
    { quota_extra: 200, price_cents: 200 },
    { quota_extra: 1000, price_cents: 500 },
  ],
};
let cached = null;
/** Apply env vars starting with ALERT_ to config. e.g. ALERT_FIREBASE_PROJECT_ID → firebase.project_id */
function applyEnvOverrides(config) {
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || !key.startsWith("ALERT_")) continue;
    const rest = key.slice(6);
    if (!rest) continue;
    const parts = rest.split("_").map((p) => p.toLowerCase());
    if (parts.length === 1) {
      config[parts[0]] = value;
      continue;
    }
    const [section, ...restParts] = parts;
    const subKey = restParts.join("_");
    if (section === "smtp") {
      if (!config.smtp) config.smtp = { host: "", port: 587, from: "" };
      config.smtp[subKey] = value;
    } else if (section === "firebase") {
      if (!config.firebase)
        config.firebase = { project_id: "", messaging_sender_id: "" };
      config.firebase[subKey] = value;
    } else {
      config[section] = value;
    }
  }
}
/** Load VAPID public/private keys from a JSON keypair file if path is set. */
function loadVapidKeypair(config) {
  const path = process.env.ALERT_FIREBASE_VAPID_KEYPAIR_PATH?.trim();
  if (!path || !config.firebase) return;
  if (config.firebase.vapid_public_key && config.firebase.vapid_private_key)
    return;
  try {
    const root = process.cwd();
    const raw = readFileSync(join(root, path), "utf-8");
    const pair = JSON.parse(raw);
    if (pair.public_key) config.firebase.vapid_public_key = pair.public_key;
    if (pair.private_key) config.firebase.vapid_private_key = pair.private_key;
  } catch {
    // ignore
  }
}
export function loadConfig() {
  if (cached) return cached;
  const root = process.cwd();
  const path = join(root, "config", "alert.yaml");
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw);
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
export function getConfig() {
  return cached ?? loadConfig();
}
