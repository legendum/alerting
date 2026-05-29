/**
 * Single pues SSE handle for Alerting. Webhook CRUD passes
 * `puesSse.broadcast` into `mountResource` and `alertsBroadcast` for
 * unread badge sync; custom handlers can import without pulling server.ts
 * into a cycle.
 */

import { resolveUser } from "pues/base/auth/server";
import { sseRoute } from "pues/base/sse";

export const puesSse = sseRoute({ resolveUser });
