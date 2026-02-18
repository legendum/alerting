import { getDb } from "../../lib/db.js";
import { json } from "../json.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseEventIds(body: { event_ids?: unknown }): number[] {
  return Array.isArray(body?.event_ids) ? body.event_ids.filter((id) => Number.isInteger(id) && id > 0) : [];
}

function parseLimit(url: URL): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
}

export function listAllEvents(req: Request, tokenHash: string): Response {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const beforeId = url.searchParams.get("before_id");
  const beforeIdNum = beforeId ? parseInt(beforeId, 10) : null;

  const db = getDb();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const params: (string | number)[] = [tokenHash, sevenDaysAgo];
  let whereExtra = "";
  if (beforeIdNum != null && !isNaN(beforeIdNum)) {
    whereExtra = " AND e.id < ?";
    params.push(beforeIdNum);
  }
  params.push(limit + 1); // fetch one extra to know if there's more

  const rows = db.query(`
    SELECT e.id, e.webhook_id, e.token_hash, e.title, e.body, e.read_at, e.created_at, w.ulid AS webhook_ulid, w.name AS webhook_name
    FROM webhook_events e
    JOIN webhooks w ON w.id = e.webhook_id
    WHERE e.token_hash = ? AND e.created_at >= ?${whereExtra}
    ORDER BY e.created_at DESC
    LIMIT ?
  `).all(...params) as {
    id: number;
    webhook_ulid: string;
    webhook_name: string;
    title: string | null;
    body: string | null;
    read_at: number | null;
    created_at: number;
  }[];
  const hasMore = rows.length > limit;
  const eventsSlice = hasMore ? rows.slice(0, limit) : rows;

  let totalUnread = 0;
  const unreadByWebhook: Record<string, number> = {};
  if (beforeIdNum == null) {
    const countRows = db.query(`
      SELECT e.read_at, w.ulid AS webhook_ulid
      FROM webhook_events e
      JOIN webhooks w ON w.id = e.webhook_id
      WHERE e.token_hash = ? AND e.created_at >= ?
    `).all(tokenHash, sevenDaysAgo) as { read_at: number | null; webhook_ulid: string }[];
    for (const r of countRows) {
      if (r.read_at == null) {
        totalUnread++;
        unreadByWebhook[r.webhook_ulid] = (unreadByWebhook[r.webhook_ulid] ?? 0) + 1;
      }
    }
  }

  const events = eventsSlice.map((r) => ({
    id: r.id,
    webhook_ulid: r.webhook_ulid,
    webhook_name: r.webhook_name,
    title: r.title ?? null,
    body: r.body ?? null,
    read_at: r.read_at ?? null,
    created_at: r.created_at,
  }));
  return json({
    events,
    total_unread: totalUnread,
    unread_by_webhook: unreadByWebhook,
    has_more: hasMore,
  });
}

/** Mark events as seen (read) for the current user. Used when viewing the inbox. */
export async function putAllEventsSeen(req: Request, tokenHash: string): Promise<Response> {
  let body: { event_ids?: unknown };
  try {
    body = (await req.json()) as { event_ids?: unknown };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const ids = parseEventIds(body);
  if (ids.length === 0) return json({ ok: true });
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const placeholders = ids.map(() => "?").join(",");
  db.run(
    `UPDATE webhook_events SET read_at = ? WHERE token_hash = ? AND id IN (${placeholders})`,
    now,
    tokenHash,
    ...ids
  );
  return json({ ok: true });
}

export function listWebhookEvents(req: Request, ulidParam: string, tokenHash: string): Response {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const beforeId = url.searchParams.get("before_id");
  const beforeIdNum = beforeId ? parseInt(beforeId, 10) : null;

  const db = getDb();
  const webhook = db.query("SELECT id FROM webhooks WHERE ulid = ? AND token_hash = ?").get(ulidParam, tokenHash) as { id: number } | undefined;
  if (!webhook) return json({ error: "not_found", message: "Webhook not found" }, 404);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const params: (number | string)[] = [webhook.id, sevenDaysAgo];
  let whereExtra = "";
  if (beforeIdNum != null && !isNaN(beforeIdNum)) {
    whereExtra = " AND id < ?";
    params.push(beforeIdNum);
  }
  params.push(limit + 1);

  const rows = db.query(`
    SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events
    WHERE webhook_id = ? AND created_at >= ?${whereExtra}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params) as { id: number; webhook_id: number; title: string | null; body: string | null; read_at: number | null; created_at: number }[];
  const hasMore = rows.length > limit;
  const eventsSlice = hasMore ? rows.slice(0, limit) : rows;
  const events = eventsSlice.map((r) => ({
    id: r.id,
    webhook_ulid: ulidParam,
    title: r.title ?? null,
    body: r.body ?? null,
    read_at: r.read_at ?? null,
    created_at: r.created_at,
  }));
  return json({ events, has_more: hasMore });
}

export async function putWebhookEventsSeen(req: Request, ulidParam: string, tokenHash: string): Promise<Response> {
  let body: { event_ids?: unknown };
  try {
    body = (await req.json()) as { event_ids?: unknown };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const ids = parseEventIds(body);
  if (ids.length === 0) return json({ ok: true });
  const db = getDb();
  const webhook = db.query("SELECT id FROM webhooks WHERE ulid = ? AND token_hash = ?").get(ulidParam, tokenHash) as { id: number } | undefined;
  if (!webhook) return json({ error: "not_found", message: "Webhook not found" }, 404);
  const now = Math.floor(Date.now() / 1000);
  const placeholders = ids.map(() => "?").join(",");
  db.run(
    `UPDATE webhook_events SET read_at = ? WHERE webhook_id = ? AND id IN (${placeholders})`,
    now,
    webhook.id,
    ...ids
  );
  return json({ ok: true });
}

export async function patchEvent(req: Request, ulidParam: string, eventIdStr: string, tokenHash: string): Promise<Response> {
  const eventId = parseInt(eventIdStr, 10);
  if (isNaN(eventId)) return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const db = getDb();
  const webhook = db.query("SELECT id FROM webhooks WHERE ulid = ? AND token_hash = ?").get(ulidParam, tokenHash) as { id: number } | undefined;
  if (!webhook) return json({ error: "not_found", message: "Webhook not found" }, 404);
  let body: { read?: boolean };
  try {
    body = (await req.json()) as { read?: boolean };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const readAt = body.read === true ? Math.floor(Date.now() / 1000) : body.read === false ? null : undefined;
  if (readAt === undefined) return json({ error: "invalid_request", message: "read must be true or false" }, 400);
  const r = db.run(
    "UPDATE webhook_events SET read_at = ? WHERE id = ? AND webhook_id = ?",
    readAt,
    eventId,
    webhook.id
  );
  if (r.changes === 0) return json({ error: "not_found", message: "Event not found" }, 404);
  const row = db.query("SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events WHERE id = ?").get(eventId) as { id: number; title: string | null; body: string | null; read_at: number | null; created_at: number };
  return json({
    id: row.id,
    webhook_ulid: ulidParam,
    title: row.title ?? null,
    body: row.body ?? null,
    read_at: row.read_at ?? null,
    created_at: row.created_at,
  });
}

export function deleteEvent(ulidParam: string, eventIdStr: string, tokenHash: string): Response {
  const eventId = parseInt(eventIdStr, 10);
  if (isNaN(eventId)) return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const db = getDb();
  const webhook = db.query("SELECT id FROM webhooks WHERE ulid = ? AND token_hash = ?").get(ulidParam, tokenHash) as { id: number } | undefined;
  if (!webhook) return json({ error: "not_found", message: "Webhook not found" }, 404);
  const r = db.run("DELETE FROM webhook_events WHERE id = ? AND webhook_id = ?", eventId, webhook.id);
  if (r.changes === 0) return json({ error: "not_found", message: "Event not found" }, 404);
  return new Response(null, { status: 204 });
}
