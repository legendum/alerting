// Shared types for the webhooks capability. Kept tiny on purpose: the runner
// is payload-agnostic, so nothing here knows about any host's event shape —
// only "run this named script with this body".

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
