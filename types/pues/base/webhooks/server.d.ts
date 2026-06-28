// Hand-curated consumer type surface for `pues/base/webhooks/server` (SPEC §9.6;
// see [[pues-part-authoring]]). Mirror the barrel — loose is fine and intended.

export type WebhookOutcome = "ran" | "missing" | "spawn_error";
export type WebhookResult = {
  name: string;
  outcome: WebhookOutcome;
  code?: number | null;
};

export type MountWebhooksOptions = {
  scriptsDir?: string;
  cwd?: string;
  env?: Record<string, string>;
};

export function mountWebhooks(
  req: Request,
  path: string,
  method: string,
  opts?: MountWebhooksOptions,
): Promise<Response | null>;

export function runWebhookScript(args: {
  name: string;
  scriptsDir: string;
  body: Uint8Array;
  cwd: string;
  env?: Record<string, string>;
}): Promise<WebhookResult>;
