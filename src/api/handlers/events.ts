import { getDb } from "../../lib/db.js";
import { olderThanCursorSql, parseEventCursor } from "../../lib/eventCursor.js";
import { pageEventsAsc } from "../../lib/eventsPage.js";
import { getUnreadSnapshot } from "../../lib/unreadCounts.js";
import { broadcastAlertsUnread } from "../alertsBroadcast.js";
import { json } from "../json.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseEventIds(body: { event_ids?: unknown }): number[] {
  return Array.isArray(body?.event_ids)
    ? body.event_ids.filter((id) => Number.isInteger(id) && id > 0)
    : [];
}

function resolveOlderCursor(url: URL): {
  created_at: number;
  id: number;
} | null {
  const fromParam = parseEventCursor(url.searchParams.get("cursor"));
  if (fromParam) return fromParam;
  const beforeId = url.searchParams.get("before_id");
  if (!beforeId) return null;
  const id = parseInt(beforeId, 10);
  if (Number.isNaN(id) || id <= 0) return null;
  const row = getDb()
    .query("SELECT created_at FROM webhook_events WHERE id = ?")
    .get(id) as { created_at: number } | undefined;
  return row ? { created_at: row.created_at, id } : null;
}

/** Resolve a webhook's numeric id, scoped to the owning user. */
function findWebhookId(ulid: string, userId: number): number | undefined {
  const row = getDb()
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulid, userId) as { id: number } | undefined;
  return row?.id;
}

function parseLimit(url: URL): number {
  return Math.min(
    MAX_PAGE_SIZE,
    Math.max(
      1,
      parseInt(
        url.searchParams.get("limit") ?? String(DEFAULT_PAGE_SIZE),
        10,
      ) || DEFAULT_PAGE_SIZE,
    ),
  );
}

export function listAllEvents(req: Request, userId: number): Response {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const olderCursor = resolveOlderCursor(url);

  const db = getDb();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const params: (number | string)[] = [userId, sevenDaysAgo];
  let whereExtra = "";
  if (olderCursor) {
    whereExtra += olderThanCursorSql("e.created_at", "e.id");
    params.push(olderCursor.created_at, olderCursor.created_at, olderCursor.id);
  }
  params.push(limit + 1); // fetch one extra to know if there's more

  const rows = db
    .query(`
    SELECT e.id, e.webhook_id, e.user_id, e.title, e.body, e.read_at, e.created_at, w.ulid AS webhook_ulid, w.name AS webhook_name
    FROM webhook_events e
    JOIN webhooks w ON w.id = e.webhook_id
    WHERE e.user_id = ? AND e.created_at >= ?${whereExtra}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ?
  `)
    .all(...params) as {
    id: number;
    webhook_ulid: string;
    webhook_name: string;
    title: string | null;
    body: string | null;
    read_at: number | null;
    created_at: number;
  }[];
  const { events: eventsSlice, hasMore } = pageEventsAsc(rows, limit);

  const unread =
    olderCursor == null
      ? getUnreadSnapshot(userId)
      : { total_unread: 0, unread_by_webhook: {} as Record<string, number> };
  const totalUnread = unread.total_unread;
  const unreadByWebhook = unread.unread_by_webhook;

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
export async function putAllEventsSeen(
  req: Request,
  userId: number,
): Promise<Response> {
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
    `UPDATE webhook_events SET read_at = ? WHERE user_id = ? AND id IN (${placeholders})`,
    [now, userId, ...ids],
  );
  broadcastAlertsUnread(userId);
  return json({ ok: true });
}

export function listWebhookEvents(
  req: Request,
  ulidParam: string,
  userId: number,
): Response {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const olderCursor = resolveOlderCursor(url);

  const webhookId = findWebhookId(ulidParam, userId);
  if (webhookId == null)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const db = getDb();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;

  const params: (number | string)[] = [webhookId, sevenDaysAgo];
  let whereExtra = "";
  if (olderCursor) {
    whereExtra += olderThanCursorSql("created_at", "id");
    params.push(olderCursor.created_at, olderCursor.created_at, olderCursor.id);
  }
  params.push(limit + 1);

  const rows = db
    .query(`
    SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events
    WHERE webhook_id = ? AND created_at >= ?${whereExtra}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `)
    .all(...params) as {
    id: number;
    webhook_id: number;
    title: string | null;
    body: string | null;
    read_at: number | null;
    created_at: number;
  }[];
  const { events: eventsSlice, hasMore } = pageEventsAsc(rows, limit);
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

export async function putWebhookEventsSeen(
  req: Request,
  ulidParam: string,
  userId: number,
): Promise<Response> {
  let body: { event_ids?: unknown };
  try {
    body = (await req.json()) as { event_ids?: unknown };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const ids = parseEventIds(body);
  if (ids.length === 0) return json({ ok: true });
  const webhookId = findWebhookId(ulidParam, userId);
  if (webhookId == null)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const placeholders = ids.map(() => "?").join(",");
  db.run(
    `UPDATE webhook_events SET read_at = ? WHERE webhook_id = ? AND id IN (${placeholders})`,
    [now, webhookId, ...ids],
  );
  broadcastAlertsUnread(userId);
  return json({ ok: true });
}

export async function patchEvent(
  req: Request,
  ulidParam: string,
  eventIdStr: string,
  userId: number,
): Promise<Response> {
  const eventId = parseInt(eventIdStr, 10);
  if (Number.isNaN(eventId))
    return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const webhookId = findWebhookId(ulidParam, userId);
  if (webhookId == null)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const db = getDb();
  let body: { read?: boolean };
  try {
    body = (await req.json()) as { read?: boolean };
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const readAt =
    body.read === true
      ? Math.floor(Date.now() / 1000)
      : body.read === false
        ? null
        : undefined;
  if (readAt === undefined)
    return json(
      { error: "invalid_request", message: "read must be true or false" },
      400,
    );
  const r = db.run(
    "UPDATE webhook_events SET read_at = ? WHERE id = ? AND webhook_id = ?",
    [readAt, eventId, webhookId],
  );
  if (r.changes === 0)
    return json({ error: "not_found", message: "Event not found" }, 404);
  broadcastAlertsUnread(userId);
  const row = db
    .query(
      "SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events WHERE id = ?",
    )
    .get(eventId) as {
    id: number;
    title: string | null;
    body: string | null;
    read_at: number | null;
    created_at: number;
  };
  return json({
    id: row.id,
    webhook_ulid: ulidParam,
    title: row.title ?? null,
    body: row.body ?? null,
    read_at: row.read_at ?? null,
    created_at: row.created_at,
  });
}

export function deleteEvent(
  ulidParam: string,
  eventIdStr: string,
  userId: number,
): Response {
  const eventId = parseInt(eventIdStr, 10);
  if (Number.isNaN(eventId))
    return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const webhookId = findWebhookId(ulidParam, userId);
  if (webhookId == null)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const db = getDb();
  const r = db.run(
    "DELETE FROM webhook_events WHERE id = ? AND webhook_id = ?",
    [eventId, webhookId],
  );
  if (r.changes === 0)
    return json({ error: "not_found", message: "Event not found" }, 404);
  broadcastAlertsUnread(userId);
  return new Response(null, { status: 204 });
}
