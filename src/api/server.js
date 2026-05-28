import { join } from "node:path";
import { getConfig, loadConfig } from "../lib/config.js";
import { getDb } from "../lib/db.js";
import { requireAuth } from "./auth-middleware.js";
import { json } from "./json.js";

const root = process.cwd();

import * as authHandlers from "./handlers/auth.js";
import * as eventHandlers from "./handlers/events.js";
import * as firebaseConfigHandlers from "./handlers/firebase-config.js";
import * as pushHandlers from "./handlers/push.js";
import * as settingsHandlers from "./handlers/settings.js";
import * as triggerHandlers from "./handlers/trigger.js";
import {
  createWebhookResourceRoutes,
  dispatchRouteMap,
} from "./webhookResource.js";

const legendumSdk = require("../lib/legendum.js");
loadConfig();
getDb();
const webhookResourceRoutes = await createWebhookResourceRoutes();
const PORT = Number(process.env.PORT || 3000);
const isDev = process.env.NODE_ENV !== "production";
const legendumMiddleware = legendumSdk.middleware({
  prefix: "/settings/legendum",
  getToken: async (_req, userId) => {
    const db = getDb();
    const row = db
      .query("SELECT legendum_token FROM users WHERE id = ?")
      .get(userId);
    return row?.legendum_token || null;
  },
  setToken: async (_req, accountToken, userId) => {
    const db = getDb();
    db.run("UPDATE users SET legendum_token = ? WHERE id = ?", [
      accountToken,
      userId,
    ]);
  },
  clearToken: async (_req, userId) => {
    const db = getDb();
    db.run("UPDATE users SET legendum_token = NULL WHERE id = ?", [userId]);
  },
});
async function legendumHandler(req, userId) {
  return legendumMiddleware(req, userId);
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function addCors(res) {
  const r = new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
  for (const [k, v] of Object.entries(corsHeaders)) r.headers.set(k, v);
  return r;
}
export default {
  port: PORT,
  development: isDev,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    let res;
    // Auth (no auth required)
    if (path === "/auth/login" && method === "GET") {
      res = authHandlers.getLogin(req);
      return addCors(res);
    }
    if (path === "/auth/callback" && method === "GET") {
      res = await authHandlers.getCallback(req);
      return addCors(res);
    }
    if (path === "/auth/logout" && method === "POST") {
      res = await authHandlers.postLogout();
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
        return new Response(file, {
          headers: { "Content-Type": "application/javascript" },
        });
      }
    }
    if (path === "/dist/pues.css") {
      const file = Bun.file(join(root, "public/dist/pues.css"));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "text/css" } });
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
        return new Response(file, {
          headers: { "Content-Type": "application/manifest+json" },
        });
      }
    }
    if (path === "/img/red-ball-192.png" || path === "/img/red-ball-512.png") {
      const file = Bun.file(join(root, "src/web", path.slice(1)));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "image/png" } });
      }
    }
    if (path === "/img/inbox-192.png" || path === "/img/inbox-512.png") {
      const file = Bun.file(join(root, "src/web", path.slice(1)));
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": "image/png" } });
      }
    }
    if (path === "/alert-sw.js") {
      const config = getConfig().firebase;
      const swFile = Bun.file(join(root, "src/web/alert-sw.js"));
      if (await swFile.exists()) {
        let js = await swFile.text();
        // Inject Firebase config if available
        if (
          config?.project_id &&
          config?.messaging_sender_id &&
          js.includes("__FIREBASE_CONFIG__")
        ) {
          const clientConfig = {
            apiKey: config.api_key ?? "",
            authDomain: config.auth_domain ?? "",
            projectId: config.project_id,
            storageBucket: config.storage_bucket ?? "",
            messagingSenderId: config.messaging_sender_id,
            appId: config.app_id ?? "",
          };
          const configStr = JSON.stringify(clientConfig);
          js = js.replace(/__FIREBASE_CONFIG__/g, configStr);
        }
        return new Response(js, {
          headers: {
            "Content-Type": "application/javascript",
            "Cache-Control": "no-store, max-age=0",
          },
        });
      }
    }
    const appName = getConfig().app_name;
    const appNameEscaped = appName
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    if (path === "/quota") {
      const file = Bun.file(join(root, "src/web/quota.html"));
      if (await file.exists()) {
        const legendumUrl =
          process.env.LEGENDUM_BASE_URL || "https://legendum.co.uk";
        const widget = legendumSdk.linkWidget({
          mountAt: "/settings/legendum",
          baseUrl: legendumUrl,
        });
        const html = (await file.text())
          .replace(/__APP_NAME__/g, appNameEscaped)
          .replace(/__LEGENDUM_URL__/g, legendumUrl)
          .replace("__LEGENDUM_WIDGET__", widget);
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
    }
    if (
      path === "/" ||
      path === "/index.html" ||
      (!path.includes(".") &&
        !path.startsWith("/api") &&
        !path.startsWith("/auth") &&
        !path.startsWith("/webhooks") &&
        !path.startsWith("/alerts") &&
        !path.startsWith("/push") &&
        !path.startsWith("/settings") &&
        !path.startsWith("/w/"))
    ) {
      const file = Bun.file(join(root, "src/web/index.html"));
      if (await file.exists()) {
        const html = (await file.text()).replace(
          /__APP_NAME__/g,
          appNameEscaped,
        );
        return new Response(html, { headers: { "Content-Type": "text/html" } });
      }
    }
    // Everything below requires auth
    const auth = requireAuth(req);
    if (auth instanceof Response) return addCors(auth);
    const { userId } = auth;
    // Legendum middleware
    const legendumRes = await legendumHandler(req, userId);
    if (legendumRes) return addCors(legendumRes);
    const webhookResourceRes = await dispatchRouteMap(
      webhookResourceRoutes,
      req,
    );
    if (webhookResourceRes) return addCors(webhookResourceRes);
    // Alerts
    if (path === "/alerts" && method === "GET") {
      res = eventHandlers.listAllEvents(req, userId);
      return addCors(res);
    }
    if (path === "/alerts/seen" && method === "PUT") {
      res = await eventHandlers.putAllEventsSeen(req, userId);
      return addCors(res);
    }
    const eventsMatch = path.match(/^\/webhooks\/([^/]+)\/events$/);
    if (eventsMatch && method === "GET") {
      res = eventHandlers.listWebhookEvents(req, eventsMatch[1], userId);
      return addCors(res);
    }
    const eventsSeenMatch = path.match(/^\/webhooks\/([^/]+)\/events\/seen$/);
    if (eventsSeenMatch && method === "PUT") {
      res = await eventHandlers.putWebhookEventsSeen(
        req,
        eventsSeenMatch[1],
        userId,
      );
      return addCors(res);
    }
    const eventPatchMatch = path.match(
      /^\/webhooks\/([^/]+)\/events\/([^/]+)$/,
    );
    if (eventPatchMatch) {
      if (method === "PATCH") {
        res = await eventHandlers.patchEvent(
          req,
          eventPatchMatch[1],
          eventPatchMatch[2],
          userId,
        );
        return addCors(res);
      }
      if (method === "DELETE") {
        res = eventHandlers.deleteEvent(
          eventPatchMatch[1],
          eventPatchMatch[2],
          userId,
        );
        return addCors(res);
      }
    }
    // Push
    if (path === "/push/register" && method === "POST") {
      res = await pushHandlers.registerPush(req, userId);
      return addCors(res);
    }
    // Settings
    if (path === "/settings/me" && method === "GET") {
      res = settingsHandlers.getMe(userId);
      return addCors(res);
    }
    if (path === "/settings/me" && method === "PATCH") {
      res = await settingsHandlers.patchMe(req, userId);
      return addCors(res);
    }
    if (path === "/settings/redeem-coupon" && method === "POST") {
      res = await settingsHandlers.redeemCoupon(req, userId);
      return addCors(res);
    }
    if (path === "/settings/piped-setup" && method === "POST") {
      res = await settingsHandlers.setupPipedAlias(req, userId);
      return addCors(res);
    }
    return addCors(json({ error: "not_found" }, 404));
  },
};
