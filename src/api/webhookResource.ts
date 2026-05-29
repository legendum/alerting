import { resolveUser } from "pues/base/auth/server";
import { loadPuesConfig, mountResource } from "pues/base/objects";
import { getDb } from "../lib/db.js";
import { toWebhookSlug, validateWebhookLabel } from "../lib/webhookSlug.js";
import { json } from "./json.js";

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

function rejectJson(status: number, error: string, message: string): Response {
  return json({ error, message }, status);
}

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
    beforeInsert: ({ body, userId }) => {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      const labelError = validateWebhookLabel(label);
      if (labelError) return rejectJson(400, "invalid_request", labelError);

      const slug = toWebhookSlug(label);
      const dup = getDb()
        .query("SELECT 1 FROM webhooks WHERE user_id = ? AND slug = ?")
        .get(userId, slug);
      if (dup) {
        return rejectJson(
          400,
          "invalid_request",
          `A webhook with URL "/${slug}" already exists`,
        );
      }

      return {
        ...body,
        label,
        slug,
        policy: parsePolicy(body.policy),
      };
    },
    beforeUpdate: ({ body, existing, userId }) => {
      const next: Record<string, unknown> = { ...body };
      if ("policy" in body) {
        next.policy = parsePolicy(body.policy);
      }

      if (typeof body.label !== "string") return next;
      const trimmed = body.label.trim();
      if (trimmed === "" || trimmed === existing.label) return next;

      const labelError = validateWebhookLabel(trimmed);
      if (labelError) return rejectJson(400, "invalid_request", labelError);

      const newSlug = toWebhookSlug(trimmed);
      const existingSlug =
        typeof existing.slug === "string" ? existing.slug : "";
      if (newSlug === existingSlug) return { ...next, label: trimmed };

      const conflict = getDb()
        .query(
          "SELECT 1 FROM webhooks WHERE user_id = ? AND slug = ? AND ulid != ?",
        )
        .get(userId, newSlug, existing.id);
      if (conflict) {
        return rejectJson(
          400,
          "invalid_request",
          `A webhook with URL "/${newSlug}" already exists`,
        );
      }
      return { ...next, label: trimmed, slug: newSlug };
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
