import { join } from "node:path";
import {
  configureAuth,
  mountAuthRoutes,
  mountLegendum,
  mountUserSettings,
} from "pues/base/auth/server";
import { mountPwaRoutes } from "pues/base/pwa/server";
import { closeTabs } from "../lib/billing.js";
import { getConfig, loadConfig } from "../lib/config.js";
import { getDb } from "../lib/db.js";
import { seedDefaultWebhookForNewUser } from "../lib/seedDefaultWebhook.js";
import { requireAuth } from "./auth-middleware.js";
import { json } from "./json.js";
import { puesSse } from "./puesSse.js";

const root = process.cwd();

import * as eventHandlers from "./handlers/events.js";
import * as firebaseConfigHandlers from "./handlers/firebase-config.js";
import * as pushHandlers from "./handlers/push.js";
import * as settingsHandlers from "./handlers/settings.js";
import * as triggerHandlers from "./handlers/trigger.js";
import { createWebhookResourceRoutes } from "./webhookResource.js";

const legendumSdk = require("../lib/legendum.js");

loadConfig();
if (!process.env.PUES_DOMAIN) {
  process.env.PUES_DOMAIN = getConfig().domain;
}
if (!process.env.PUES_COOKIE_SECRET && getConfig().cookie_secret) {
  process.env.PUES_COOKIE_SECRET = getConfig().cookie_secret;
}
getDb();
configureAuth({ getDb, onNewUser: seedDefaultWebhookForNewUser });

const pwa = await mountPwaRoutes({ root });
const webhookResourceRoutes = await createWebhookResourceRoutes({
  broadcast: puesSse.broadcast,
});

const PORT = Number(process.env.PORT || 3000);
const isDev = process.env.NODE_ENV !== "production";

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function addCors(res: Response): Response {
  const r = new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
  for (const [k, v] of Object.entries(corsHeaders)) r.headers.set(k, v);
  return r;
}

type RouteHandler = (req: Request) => Response | Promise<Response>;
type RouteMethods = Record<string, RouteHandler>;
type RouteMap = Record<string, RouteMethods>;
type RoutedRequest = Request & { params: Record<string, string> };

function param(req: Request, key: string): string {
  return (req as RoutedRequest).params[key];
}

function withCors(handler: RouteHandler): RouteHandler {
  return async (req: Request) => addCors(await handler(req));
}

function wrapCorsRoutes(routes: RouteMap): RouteMap {
  const out: RouteMap = {};
  for (const [path, methods] of Object.entries(routes)) {
    const wrapped: RouteMethods = {};
    for (const [method, handler] of Object.entries(methods)) {
      wrapped[method] = withCors(handler);
    }
    out[path] = wrapped;
  }
  return out;
}

function wrapCorsPwaRoutes(routes: Record<string, RouteHandler>): RouteMap {
  const out: RouteMap = {};
  for (const [path, handler] of Object.entries(routes)) {
    out[path] = { GET: withCors(handler) };
  }
  return out;
}

async function serveAlertingSwHooks(): Promise<Response> {
  const config = getConfig().firebase;
  const swFile = Bun.file(join(root, "src/web/alerting-sw-hooks.js"));
  if (!(await swFile.exists())) return json({ error: "not_found" }, 404);
  let js = await swFile.text();
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
    js = js.replace(/__FIREBASE_CONFIG__/g, JSON.stringify(clientConfig));
  }
  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function withAuth(
  req: Request,
  run: (ctx: { userId: number }) => Promise<Response> | Response,
): Promise<Response> {
  const auth = requireAuth(req);
  if (auth instanceof Response) return auth;
  return run({ userId: auth.userId });
}

/** Send a static file with the given content-type. 404 if missing. */
async function serveStatic(
  filePath: string,
  contentType: string,
  cacheControl?: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    ...(extraHeaders ?? {}),
  };
  return new Response(file, { headers });
}

async function serveIndexHtml(): Promise<Response> {
  const file = Bun.file(join(root, "src/web/index.html"));
  if (!(await file.exists())) return json({ error: "not_found" }, 404);
  const appNameEscaped = getConfig()
    .app_name.replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const html = (await file.text()).replace(/__APP_NAME__/g, appNameEscaped);
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

const routes: RouteMap = {
  "/api/firebase-config": {
    GET: () => firebaseConfigHandlers.getFirebaseConfig(),
  },
  "/w/:ulid": {
    GET: (req) => triggerHandlers.triggerWebhook(req, param(req, "ulid")),
    POST: (req) => triggerHandlers.triggerWebhook(req, param(req, "ulid")),
  },
  "/main.js": {
    GET: () =>
      serveStatic(join(root, "dist/main.js"), "application/javascript"),
  },
  "/main.css": {
    GET: () => serveStatic(join(root, "src/web/main.css"), "text/css"),
  },
  "/dist/pues.css": {
    GET: () => serveStatic(join(root, "public/dist/pues.css"), "text/css"),
  },
  "/quota": {
    GET: async () => {
      const file = Bun.file(join(root, "src/web/quota.html"));
      if (!(await file.exists())) return json({ error: "not_found" }, 404);
      const appNameEscaped = getConfig()
        .app_name.replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
      const legendumUrl =
        process.env.LEGENDUM_BASE_URL || "https://legendum.co.uk";
      const widget = legendumSdk.linkWidget({
        mountAt: "/pues/legendum",
        baseUrl: legendumUrl,
      });
      const html = (await file.text())
        .replace(/__APP_NAME__/g, appNameEscaped)
        .replace(/__LEGENDUM_URL__/g, legendumUrl)
        .replace("__LEGENDUM_WIDGET__", widget);
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    },
  },
  "/alerts": {
    GET: (req) =>
      withAuth(req, ({ userId }) => eventHandlers.listAllEvents(req, userId)),
  },
  "/alerts/seen": {
    PUT: (req) =>
      withAuth(req, ({ userId }) =>
        eventHandlers.putAllEventsSeen(req, userId),
      ),
  },
  "/webhooks/:ulid/events": {
    GET: (req) =>
      withAuth(req, ({ userId }) =>
        eventHandlers.listWebhookEvents(req, param(req, "ulid"), userId),
      ),
  },
  "/webhooks/:ulid/events/seen": {
    PUT: (req) =>
      withAuth(req, ({ userId }) =>
        eventHandlers.putWebhookEventsSeen(req, param(req, "ulid"), userId),
      ),
  },
  "/webhooks/:ulid/events/:eventId": {
    PATCH: (req) =>
      withAuth(req, ({ userId }) =>
        eventHandlers.patchEvent(
          req,
          param(req, "ulid"),
          param(req, "eventId"),
          userId,
        ),
      ),
    DELETE: (req) =>
      withAuth(req, ({ userId }) =>
        eventHandlers.deleteEvent(
          param(req, "ulid"),
          param(req, "eventId"),
          userId,
        ),
      ),
  },
  "/push/register": {
    POST: (req) =>
      withAuth(req, ({ userId }) => pushHandlers.registerPush(req, userId)),
  },
  "/settings/me": {
    GET: (req) => withAuth(req, ({ userId }) => settingsHandlers.getMe(userId)),
    PATCH: (req) =>
      withAuth(req, ({ userId }) => settingsHandlers.patchMe(req, userId)),
  },
  "/settings/redeem-coupon": {
    POST: (req) =>
      withAuth(req, ({ userId }) => settingsHandlers.redeemCoupon(req, userId)),
  },
  "/settings/piped-setup": {
    POST: (req) =>
      withAuth(req, ({ userId }) =>
        settingsHandlers.setupPipedAlias(req, userId),
      ),
  },
};

export default {
  port: PORT,
  development: isDev,
  idleTimeout: 255,
  routes: {
    ...wrapCorsRoutes(mountAuthRoutes()),
    ...wrapCorsRoutes(mountLegendum()),
    ...wrapCorsRoutes(mountUserSettings()),
    ...wrapCorsPwaRoutes(pwa.routes),
    ...wrapCorsRoutes(routes),
    ...wrapCorsRoutes(webhookResourceRoutes as RouteMap),
    ...wrapCorsRoutes(puesSse.routes as RouteMap),
  },
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const pwaHit = await pwa.fetch(req);
    if (pwaHit) return addCors(pwaHit);

    if (path === "/dist/alerting-sw-hooks.js" && method === "GET") {
      return addCors(await serveAlertingSwHooks());
    }

    // /img/inbox-* are also registered on pwa.routes (manifest icons).
    // /img/red-ball-* and any other public/img asset fall through here.
    if (path.startsWith("/img/")) {
      const safe = path.replace(/\.\./g, "");
      return addCors(
        await serveStatic(join(root, "public", safe), "image/png"),
      );
    }

    // Hash-named /dist/* (workbox chunks handled by pwa.fetch above).
    if (path.startsWith("/dist/")) {
      const safe = path.replace(/\.\./g, "");
      return addCors(
        await serveStatic(
          join(root, "public", safe),
          "application/javascript",
          "public, max-age=31536000, immutable",
        ),
      );
    }

    if (
      path === "/" ||
      path === "/index.html" ||
      (!path.includes(".") &&
        !path.startsWith("/api") &&
        !path.startsWith("/pues") &&
        !path.startsWith("/webhooks") &&
        !path.startsWith("/alerts") &&
        !path.startsWith("/push") &&
        !path.startsWith("/settings") &&
        !path.startsWith("/w/") &&
        !path.startsWith("/dist/") &&
        !path.startsWith("/img/"))
    ) {
      return addCors(await serveIndexHtml());
    }
    return addCors(json({ error: "not_found" }, 404));
  },
};

process.on("SIGTERM", async () => {
  await closeTabs();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await closeTabs();
  process.exit(0);
});
