// Dispatch half of the webhooks capability: spawn `scripts/webhooks/<name>.sh`
// detached, with the raw payload on stdin and a minimal documented env.
//
// "Detached" is the whole point — a deploy script can take minutes, and the
// webhook is downstream of an event that already happened (a merge can't be
// un-fired), so we never let the script hold the response socket. The HTTP
// layer (server.ts) returns 202 immediately; this runs to completion in the
// background and only its exit status is logged.

import { join } from "node:path";
import type { WebhookResult } from "./types";

/** Run `scripts/webhooks/<name>.sh` if present, detached from any response.
 *
 *  The script receives the raw request body on **stdin** (so it can `jq`
 *  whatever it needs) plus `process.env` + `WEBHOOK_NAME` + any host `env`.
 *  A missing script is logged loudly (the webhook is wired but unhandled) and
 *  treated as a no-op — the caller still 202s. Resolves to a {@link WebhookResult}
 *  for logging/tests; callers in the request path do not await it. */
export async function runWebhookScript(args: {
  name: string;
  scriptsDir: string;
  /** Raw request body, forwarded verbatim to the script's stdin. */
  body: Uint8Array;
  cwd: string;
  env?: Record<string, string>;
}): Promise<WebhookResult> {
  const { name, scriptsDir, body, cwd, env } = args;
  const scriptPath = join(scriptsDir, `${name}.sh`);

  if (!(await Bun.file(scriptPath).exists())) {
    // Wired (secret matched) but nothing handles it — worth seeing in logs.
    console.error("[webhooks] script missing", { name, path: scriptPath });
    return { name, outcome: "missing" };
  }

  try {
    const proc = Bun.spawn(["bash", scriptPath], {
      cwd,
      env: { ...process.env, ...env, WEBHOOK_NAME: name },
      stdin: body,
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await proc.exited;
    if (code === 0) {
      console.info("[webhooks] script ok", { name });
    } else {
      console.error("[webhooks] script failed", { name, code });
    }
    return { name, outcome: "ran", code };
  } catch (err) {
    console.error("[webhooks] script spawn error", {
      name,
      error: String(err),
    });
    return { name, outcome: "spawn_error" };
  }
}
