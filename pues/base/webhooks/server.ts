// Server-only barrel + route for the webhooks capability.
//
// A **webhook** is a named inbound POST that runs `scripts/webhooks/<name>.sh`
// on the server, guarded by a secret in the env. Pues owns the route, the auth,
// and the dispatch; the host app owns the scripts. There is no registry: a
// webhook "exists" exactly when its secret is set — either the per-webhook
// `PUES_WEBHOOKS_<NAME>_SECRET` or the global `PUES_WEBHOOKS_SECRET` fallback —
// AND `scripts/webhooks/<name>.sh` is present. The global authenticates every
// webhook name, so use it only when one caller fans a single trust domain out
// across many event-named webhooks (e.g. dojos posting per-event hooks).
//
//     POST /webhooks/<name>?secret=<secret>
//     POST /webhooks/<name>   (X-Webhook-Secret: <secret>)
//
// The single load-bearing security property: a missing/wrong secret, an
// unconfigured webhook, and a genuinely dead path must all look identical
// (a plain 404). Never 401/403 — existence is itself information.

import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { defaultRoot } from "../core/defaultRoot";
import { runWebhookScript } from "./run";
import type { MountWebhooksOptions } from "./types";

export { dispatchWebhook } from "./dispatch";
export { runWebhookScript } from "./run";
export type {
  DispatchResult,
  DispatchWebhookOptions,
  MountWebhooksOptions,
  WebhookOutcome,
  WebhookResult,
} from "./types";

/** Webhook names become a filename and an env suffix, so constrain them hard:
 *  lowercase word chars only — no `.`/`/` that could escape `scripts/webhooks/`. */
const NAME_RE = /^[a-z0-9_-]+$/;

/** A 404 that reveals nothing — same for a dead path, a missing secret, a wrong
 *  secret, or an unconfigured webhook. */
function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** `PUES_WEBHOOKS_<NAME>_SECRET` — name upper-cased, `-` → `_`. */
function secretEnvVar(name: string): string {
  return `PUES_WEBHOOKS_${name.toUpperCase().replace(/-/g, "_")}_SECRET`;
}

/** Length-safe, constant-time string compare (timing can't sidechannel it). */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Compare equal-length buffers so a length mismatch can't be timed.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Match + handle `POST /webhooks/<name>`. Returns a `Response` when this owns
 * the request, or `null` to fall through to the host's normal routing/404.
 *
 * Owns: path match, secret check (header or query), the 404 masking, the
 * missing-script log, the detached spawn, and the 202. The host supplies only
 * `scriptsDir` (and may compose rate-limiting / access-log redaction around it).
 */
export async function mountWebhooks(
  req: Request,
  path: string,
  method: string,
  opts: MountWebhooksOptions = {},
): Promise<Response | null> {
  // 1. Match. Only POST /webhooks/<name> with a filesystem-safe name; anything
  //    else is not ours — fall through (the host 404s as usual).
  if (method !== "POST") return null;
  const m = path.match(/^\/webhooks\/([^/]+)$/);
  if (!m) return null;
  const name = m[1]!;
  if (!NAME_RE.test(name)) return notFound();

  // 2. Authenticate. Accept either the per-webhook secret or a global fallback
  //    `PUES_WEBHOOKS_SECRET` (for callers that fan one trust domain out across
  //    many event-named webhooks — same key, N routes). An unset env or a
  //    non-matching secret looks like a dead route. The `||` short-circuit leaks
  //    nothing: every failure returns the identical 404, regardless of which
  //    secret was tried.
  const url = new URL(req.url);
  const provided =
    req.headers.get("X-Webhook-Secret") ?? url.searchParams.get("secret") ?? "";
  const specific = process.env[secretEnvVar(name)];
  const generic = process.env.PUES_WEBHOOKS_SECRET;
  const ok =
    !!provided &&
    ((!!specific && secretsMatch(provided, specific)) ||
      (!!generic && secretsMatch(provided, generic)));
  if (!ok) return notFound();

  // 3. Dispatch. Read the raw body (payload-agnostic — straight to the script's
  //    stdin), then spawn detached. We never await it: the upstream event
  //    already happened, and a deploy can take minutes — return 202 now.
  const scriptsDir =
    opts.scriptsDir ?? resolve(defaultRoot(), "scripts/webhooks");
  const cwd = opts.cwd ?? resolve(scriptsDir, "../..");
  const body = new Uint8Array(await req.arrayBuffer());

  void runWebhookScript({ name, scriptsDir, body, cwd, env: opts.env });

  return new Response(JSON.stringify({ ok: true, name }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}
