import { getConfig } from "../../lib/config.js";
import { json } from "../json.js";

/**
 * Public endpoint: returns Firebase web app config for the client (no auth).
 * Used by the PWA to initialize Firebase and get FCM token.
 */
export function getFirebaseConfig(): Response {
  const config = getConfig().firebase;
  if (!config?.project_id || !config?.messaging_sender_id || !config?.vapid_public_key?.trim()) {
    return json({ error: "not_configured", message: "Firebase is not configured" }, 503);
  }
  return json({
    apiKey: config.api_key ?? null,
    authDomain: config.auth_domain ?? null,
    projectId: config.project_id,
    storageBucket: config.storage_bucket ?? null,
    messagingSenderId: config.messaging_sender_id,
    appId: config.app_id ?? null,
    vapidPublicKey: config.vapid_public_key,
  });
}
