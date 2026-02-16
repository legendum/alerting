import { join } from "path";
import { loadConfig, getConfig } from "../lib/config.js";
import { getDb } from "../lib/db.js";
import { log } from "../lib/logger.js";
import { requireAuth } from "./auth-middleware.js";
import { json } from "./json.js";

const root = process.cwd();

import * as authHandlers from "./handlers/auth.js";
import * as webhookHandlers from "./handlers/webhooks.js";
import * as eventHandlers from "./handlers/events.js";
import * as firebaseConfigHandlers from "./handlers/firebase-config.js";
import * as pushHandlers from "./handlers/push.js";
import * as settingsHandlers from "./handlers/settings.js";
import * as triggerHandlers from "./handlers/trigger.js";

loadConfig();
getDb();

const PORT = 3030;
const isDev = process.env.NODE_ENV !== "production";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function addCors(res: Response): Response {
  const r = new Response(res.body, { status: res.status, headers: res.headers });
  for (const [k, v] of Object.entries(corsHeaders)) r.headers.set(k, v);
  return r;
}

export default {
  port: PORT,
  development: isDev,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    let res: Response;

    // Auth (no auth required)
    if (path === "/auth/request-link" && method === "POST") {
      res = await authHandlers.postRequestLink(req);
      return addCors(res);
    }
    if (path === "/auth/verify" && method === "GET") {
      res = await authHandlers.getVerify(req);
      return addCors(res);
    }
    if (path === "/auth/verify" && method === "POST") {
      res = await authHandlers.postVerify(req);
      return addCors(res);
    }
    if (path === "/auth/logout" && method === "POST") {
      res = await authHandlers.postLogout();
      return addCors(res);
    }
    if (path === "/auth/confirm-email" && method === "GET") {
      res = await authHandlers.getConfirmEmail(req);
      return addCors(res);
    }

    // Firebase config for PWA (public)
    if (path === "/api/firebase-config" && method === "GET") {
      res = firebaseConfigHandlers.getFirebaseConfig();
      return addCors(res);
    }

    // Trigger (public)
    const triggerMatch = path.match(/^\/w\/([^/]+)$/);
    if (triggerMatch && (method === "GET" || method === "POST")) {
      res = await triggerHandlers.triggerWebhook(req, triggerMatch[1]);
      return addCors(res);
    }

    // Static assets and web app (before auth so GET / loads the app)
    if (path === "/main.js") {
      const file = Bun.file(join(root, "dist/main.js"));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "application/javascript" } });
      }
    }
    if (path === "/main.css") {
      const file = Bun.file(join(root, "src/web/main.css"));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "text/css" } });
      }
    }
    if (path === "/manifest.json") {
      const file = Bun.file(join(root, "src/web/manifest.json"));
      if (await file.exists()) {
        let json = await file.text();
        json = json.replace(/"Alert"/g, () => JSON.stringify(getConfig().app_name));
        return new Response(json, { headers: { "Content-Type": "application/manifest+json" } });
      }
    }
    if (path === "/logo-192.png" || path === "/logo-512.png" || path === "/gray-192.png") {
      const file = Bun.file(join(root, "src/web", path.slice(1)));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "image/png" } });
      }
    }
    if (path === "/firebase-messaging-sw.js") {
      const config = getConfig().firebase;
      if (config?.project_id && config?.messaging_sender_id) {
        const swTemplate = Bun.file(join(root, "src/web/firebase-messaging-sw.template.js"));
        if (await swTemplate.exists()) {
          const clientConfig = {
            apiKey: config.api_key ?? "",
            authDomain: config.auth_domain ?? "",
            projectId: config.project_id,
            storageBucket: config.storage_bucket ?? "",
            messagingSenderId: config.messaging_sender_id,
            appId: config.app_id ?? "",
          };
          let js = await swTemplate.text();
          const configStr = JSON.stringify(clientConfig);
          if (!js.includes("__FIREBASE_CONFIG__")) {
            return new Response("console.error('SW template missing __FIREBASE_CONFIG__');", { status: 500, headers: { "Content-Type": "application/javascript" } });
          }
          js = js.replace(/__FIREBASE_CONFIG__/g, configStr);
          return new Response(js, {
            headers: {
              "Content-Type": "application/javascript",
              "Cache-Control": "no-store, max-age=0",
            },
          });
        }
      }
    }
    const appName = getConfig().app_name;
    const appNameEscaped = appName.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    if (path === "/quota") {
      const file = Bun.file(join(root, "src/web/quota.html"));
      if (await file.exists()) {
        const couponPricesJson = JSON.stringify(getConfig().coupon_prices ?? []);
        const html = (await file.text())
          .replace(/__APP_NAME__/g, appNameEscaped)
          .replace("__COUPON_PRICES__", couponPricesJson);
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
    }
    if (path === "/" || path === "/index.html" || (!path.includes(".") && !path.startsWith("/api") && !path.startsWith("/auth") && !path.startsWith("/webhooks") && !path.startsWith("/events") && !path.startsWith("/inbox") && !path.startsWith("/push") && !path.startsWith("/settings") && !path.startsWith("/w/"))) {
      const file = Bun.file(join(root, "src/web/index.html"));
      if (await file.exists()) {
        const html = (await file.text()).replace(/__APP_NAME__/g, appNameEscaped);
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
    }

    // Everything below requires auth
    const auth = requireAuth(req);
    if (auth instanceof Response) return addCors(auth);
    const { tokenHash } = auth;

    // Webhooks
    if (path === "/webhooks" && method === "GET") {
      res = webhookHandlers.listWebhooks(tokenHash);
      return addCors(res);
    }
    if (path === "/webhooks" && method === "POST") {
      res = await webhookHandlers.createWebhook(req, tokenHash);
      return addCors(res);
    }
    const webhookMatch = path.match(/^\/webhooks\/([^/]+)$/);
    if (webhookMatch) {
      const ulid = webhookMatch[1];
      if (method === "GET") {
        res = webhookHandlers.getWebhook(ulid, tokenHash);
        return addCors(res);
      }
      if (method === "PATCH") {
        res = await webhookHandlers.patchWebhook(req, ulid, tokenHash);
        return addCors(res);
      }
      if (method === "DELETE") {
        res = webhookHandlers.deleteWebhook(ulid, tokenHash);
        return addCors(res);
      }
    }

    // Events
    if ((path === "/events" || path === "/inbox") && method === "GET") {
      res = eventHandlers.listAllEvents(req, tokenHash);
      return addCors(res);
    }
    if (path === "/events/seen" && method === "PUT") {
      res = await eventHandlers.putAllEventsSeen(req, tokenHash);
      return addCors(res);
    }
    const eventsMatch = path.match(/^\/webhooks\/([^/]+)\/events$/);
    if (eventsMatch && method === "GET") {
      res = eventHandlers.listWebhookEvents(req, eventsMatch[1], tokenHash);
      return addCors(res);
    }
    const eventsSeenMatch = path.match(/^\/webhooks\/([^/]+)\/events\/seen$/);
    if (eventsSeenMatch && method === "PUT") {
      res = await eventHandlers.putWebhookEventsSeen(req, eventsSeenMatch[1], tokenHash);
      return addCors(res);
    }
    const eventPatchMatch = path.match(/^\/webhooks\/([^/]+)\/events\/([^/]+)$/);
    if (eventPatchMatch && method === "PATCH") {
      res = await eventHandlers.patchEvent(req, eventPatchMatch[1], eventPatchMatch[2], tokenHash);
      return addCors(res);
    }

    // Push
    if (path === "/push/register" && method === "POST") {
      res = await pushHandlers.registerPush(req, tokenHash);
      return addCors(res);
    }

    // Settings
    if (path === "/settings/me" && method === "GET") {
      res = settingsHandlers.getMe(tokenHash);
      return addCors(res);
    }
    if (path === "/settings/me" && method === "PATCH") {
      res = await settingsHandlers.patchMe(req, tokenHash);
      return addCors(res);
    }
    if (path === "/settings/change-email" && method === "POST") {
      res = await settingsHandlers.postChangeEmail(req, tokenHash);
      return addCors(res);
    }
    if (path === "/settings/redeem-coupon" && method === "POST") {
      res = await settingsHandlers.redeemCoupon(req, tokenHash);
      return addCors(res);
    }

    return addCors(json({ error: "not_found" }, 404));
  },
};
