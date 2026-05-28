import { resolveUser } from "pues/base/auth/server";
import { loadPuesConfig, mountResource } from "pues/base/objects";
import { getDb } from "../lib/db.js";

type Handler = (
  req: Request & { params?: Record<string, string> },
) => Promise<Response> | Response;
type RouteMap = Record<string, Record<string, Handler>>;
type Broadcast = (
  userId: number,
  event: string,
  data: unknown,
  opts?: { op_id?: string | null },
) => void;

const DEFAULT_POLICY = { email_schedule: "never", retention_days: 7 };

function parsePolicy(policy: unknown): string {
  if (policy == null) return JSON.stringify(DEFAULT_POLICY);
  if (typeof policy === "string") {
    try {
      const parsed = JSON.parse(policy);
      return JSON.stringify(
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : DEFAULT_POLICY,
      );
    } catch {
      return JSON.stringify(DEFAULT_POLICY);
    }
  }
  if (typeof policy === "object" && !Array.isArray(policy)) {
    return JSON.stringify(policy);
  }
  return JSON.stringify(DEFAULT_POLICY);
}

function normalizeDescription(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function matchRoute(
  routePath: string,
  actualPath: string,
): Record<string, string> | null {
  const routeParts = routePath.split("/").filter(Boolean);
  const actualParts = actualPath.split("/").filter(Boolean);
  if (routeParts.length !== actualParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const actualPart = actualParts[i];
    if (routePart.startsWith(":")) {
      params[routePart.slice(1)] = decodeURIComponent(actualPart);
      continue;
    }
    if (routePart !== actualPart) return null;
  }
  return params;
}

export async function createWebhookResourceRoutes(opts?: {
  broadcast?: Broadcast;
}): Promise<RouteMap> {
  const puesConfig = await loadPuesConfig();
  const config = puesConfig.objects?.resources?.webhooks;
  if (!config) {
    throw new Error(
      "config/pues.yaml: `objects.resources.webhooks` is required for /api/webhooks.",
    );
  }

  return mountResource({
    db: getDb,
    name: "webhooks",
    config,
    resolveUser,
    broadcast: opts?.broadcast,
    beforeInsert: ({ body }) => {
      const next: Record<string, unknown> = {
        ...body,
        policy: parsePolicy(body.policy),
      };
      if ("description" in body) {
        next.description = normalizeDescription(body.description);
      }
      return next;
    },
    beforeUpdate: ({ body }) => {
      const next: Record<string, unknown> = { ...body };
      if ("policy" in body) {
        next.policy = parsePolicy(body.policy);
      }
      if ("description" in body) {
        next.description = normalizeDescription(body.description);
      }
      return next;
    },
  }) as RouteMap;
}

export async function dispatchRouteMap(
  routes: RouteMap,
  req: Request,
): Promise<Response | null> {
  const url = new URL(req.url);
  const method = req.method.toUpperCase();

  const exact = routes[url.pathname]?.[method];
  if (exact) return exact(req as Request & { params?: Record<string, string> });

  for (const [routePath, methods] of Object.entries(routes)) {
    if (!routePath.includes(":")) continue;
    const handler = methods[method];
    if (!handler) continue;
    const params = matchRoute(routePath, url.pathname);
    if (!params) continue;
    const reqWithParams = req as Request & { params?: Record<string, string> };
    reqWithParams.params = params;
    return handler(reqWithParams);
  }

  return null;
}
