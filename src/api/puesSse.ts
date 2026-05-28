/**
 * Single pues SSE handle for Alerting. Webhook CRUD passes
 * `puesSse.broadcast` into `mountResource`; custom event handlers can
 * import it later without pulling server.ts into a cycle.
 */

import { resolveUser } from "pues/base/auth/server";
import { sseRoute } from "pues/base/sse";

export const puesSse = sseRoute({ resolveUser });
