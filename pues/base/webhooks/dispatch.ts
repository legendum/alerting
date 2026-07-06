// Outbound half of the webhooks capability: POST a JSON payload at a URL and
// forget it. The mirror of run.ts — that runs an INBOUND script when a webhook
// arrives; this fires an OUTBOUND webhook when a host's lifecycle event happens.
//
// Fire-and-forget is the whole point: a webhook sits downstream of an action
// that already happened, so a slow or broken receiver must never block or fail
// it. We cap the socket with a timeout and hand the host a typed result to log;
// we never throw, so a voided call can't surface an unhandled rejection. The
// host owns the payload shape and any domain headers (an event marker, the
// receiver's configured auth) — this stays payload-agnostic, exactly like the
// inbound runner.

import type { DispatchResult, DispatchWebhookOptions } from "./types";

/** How long we wait on the receiver before giving up — a webhook can't hold a
 *  socket open indefinitely off a lifecycle event. */
const WEBHOOK_TIMEOUT_MS = 10_000;

/** POST `body` as JSON to `url`, fire-and-forget. Resolves to a typed result the
 *  host can log (a 2xx, a non-2xx status, or a thrown/timed-out error); it never
 *  rejects. `Content-Type: application/json` is set for you; `headers` are merged
 *  over it. */
export async function dispatchWebhook(
  opts: DispatchWebhookOptions,
): Promise<DispatchResult> {
  const { url, body, headers, timeoutMs = WEBHOOK_TIMEOUT_MS } = opts;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
