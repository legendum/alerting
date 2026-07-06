// Shared types for the webhooks capability — both halves: the inbound runner
// ("run this named script with this body") and the outbound dispatcher ("POST
// this body at this URL"). Both are payload-agnostic on purpose: nothing here
// knows about any host's event shape.

/** What happened to a single dispatch — surfaced for logs/tests, never to the
 *  caller (the HTTP response is always 202 once the secret checks out). */
export type WebhookOutcome = "ran" | "missing" | "spawn_error";

/** Result of attempting to run `scripts/webhooks/<name>.sh`. `code` is the
 *  script's exit status when `outcome === "ran"`, else null/undefined. */
export type WebhookResult = {
  name: string;
  outcome: WebhookOutcome;
  code?: number | null;
};

/** Options for an outbound webhook POST (`dispatchWebhook`). `body` is the
 *  fully-assembled JSON payload — Pues adds nothing to it — and `headers` are the
 *  host's (an event marker, the receiver's configured auth); `Content-Type:
 *  application/json` is set for you. */
export type DispatchWebhookOptions = {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  /** Socket timeout in ms before we give up; defaults to 10_000. */
  timeoutMs?: number;
};

/** The settled outcome of a dispatch, for the host to log. `ok` is true only on
 *  a 2xx. `status` is the HTTP status when the request completed; `error` is set
 *  instead when the request threw or timed out — never both. */
export type DispatchResult = {
  ok: boolean;
  status?: number;
  error?: string;
};

export type MountWebhooksOptions = {
  /** Directory holding `<name>.sh` scripts. Defaults to
   *  `<root>/scripts/webhooks` for a vendored pues tree. */
  scriptsDir?: string;
  /** Working directory for the spawned script. Defaults to the repo root
   *  (`scriptsDir/../..`). */
  cwd?: string;
  /** Extra env vars merged into every script's environment, on top of
   *  `process.env` + `WEBHOOK_NAME`. Host-supplied + payload-agnostic — the
   *  generic runner never parses the body to derive env (the script reads
   *  stdin for that). */
  env?: Record<string, string>;
};
