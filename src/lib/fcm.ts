// firebase-admin uses module.exports; ESM interop puts it on .default
import firebaseAdmin from "firebase-admin";
const admin = firebaseAdmin?.default ?? firebaseAdmin;
import { join } from "path";
import { getConfig } from "./config.js";
import { log } from "./logger.js";

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  const config = getConfig().firebase;
  const pathRaw = config?.service_account_path?.trim();
  const useAppDefault = !pathRaw && process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!pathRaw && !useAppDefault) {
    if (process.env.NODE_ENV !== "test") {
      log.info("FCM: no service_account_path or GOOGLE_APPLICATION_CREDENTIALS; push will be logged only");
    }
    return false;
  }
  try {
    if (pathRaw) {
      const path = pathRaw.startsWith("/") ? pathRaw : join(process.cwd(), pathRaw);
      admin.initializeApp({ credential: admin.credential.cert(path) });
    } else {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
    initialized = true;
  } catch (e) {
    log.error("FCM: failed to initialize", e);
    return false;
  }
  return initialized;
}

export async function sendFcmPush(opts: {
  fcmToken: string;
  title?: string;
  body?: string;
}): Promise<void> {
  if (!ensureInitialized()) {
    if (process.env.NODE_ENV !== "test") {
      log.info("FCM push (no backend)", opts.fcmToken.slice(0, 20) + "...", opts.title ?? opts.body);
    }
    return;
  }
  try {
    const title = opts.title ?? "Alert";
    const body = opts.body ?? "";
    const messageId = await admin.messaging().send({
      token: opts.fcmToken,
      data: {
        title,
        body,
        url: "/",
      },
      webpush: {
        fcmOptions: { link: "/" },
        headers: { Urgency: "high" },
      },
    });
    log.info("FCM push sent", { title, messageId });
  } catch (err) {
    log.error("FCM send failed", opts.fcmToken.slice(0, 20) + "...", err);
    throw err;
  }
}
