import { getDb } from "../../lib/db.js";
import { json } from "../json.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
function parseEventIds(body) {
  return Array.isArray(body?.event_ids)
    ? body.event_ids.filter((id) => Number.isInteger(id) && id > 0)
    : [];
}
function parseLimit(url) {
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
export function listAllEvents(req, userId) {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const beforeId = url.searchParams.get("before_id");
  const beforeIdNum = beforeId ? parseInt(beforeId, 10) : null;
  const db = getDb();
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  const params = [userId, sevenDaysAgo];
  let whereExtra = "";
  if (beforeIdNum != null && !Number.isNaN(beforeIdNum)) {
    whereExtra = " AND e.id < ?";
    params.push(beforeIdNum);
  }
  params.push(limit + 1); // fetch one extra to know if there's more
  const rows = db
    .query(`
    SELECT e.id, e.webhook_id, e.user_id, e.title, e.body, e.read_at, e.created_at, w.ulid AS webhook_ulid, w.name AS webhook_name
    FROM webhook_events e
    JOIN webhooks w ON w.id = e.webhook_id
    WHERE e.user_id = ? AND e.created_at >= ?${whereExtra}
    ORDER BY e.created_at DESC
    LIMIT ?
  `)
    .all(...params);
  const hasMore = rows.length > limit;
  const eventsSlice = hasMore ? rows.slice(0, limit) : rows;
  let totalUnread = 0;
  const unreadByWebhook = {};
  if (beforeIdNum == null) {
    const countRows = db
      .query(`
      SELECT e.read_at, w.ulid AS webhook_ulid
      FROM webhook_events e
      JOIN webhooks w ON w.id = e.webhook_id
      WHERE e.user_id = ? AND e.created_at >= ?
    `)
      .all(userId, sevenDaysAgo);
    for (const r of countRows) {
      if (r.read_at == null) {
        totalUnread++;
        unreadByWebhook[r.webhook_ulid] =
          (unreadByWebhook[r.webhook_ulid] ?? 0) + 1;
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
export async function putAllEventsSeen(req, userId) {
  let body;
  try {
    body = await req.json();
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
  return json({ ok: true });
}
export function listWebhookEvents(req, ulidParam, userId) {
  const url = new URL(req.url);
  const limit = parseLimit(url);
  const beforeId = url.searchParams.get("before_id");
  const beforeIdNum = beforeId ? parseInt(beforeId, 10) : null;
  const db = getDb();
  const webhook = db
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulidParam, userId);
  if (!webhook)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  const params = [webhook.id, sevenDaysAgo];
  let whereExtra = "";
  if (beforeIdNum != null && !Number.isNaN(beforeIdNum)) {
    whereExtra = " AND id < ?";
    params.push(beforeIdNum);
  }
  params.push(limit + 1);
  const rows = db
    .query(`
    SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events
    WHERE webhook_id = ? AND created_at >= ?${whereExtra}
    ORDER BY created_at DESC
    LIMIT ?
  `)
    .all(...params);
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
export async function putWebhookEventsSeen(req, ulidParam, userId) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const ids = parseEventIds(body);
  if (ids.length === 0) return json({ ok: true });
  const db = getDb();
  const webhook = db
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulidParam, userId);
  if (!webhook)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const now = Math.floor(Date.now() / 1000);
  const placeholders = ids.map(() => "?").join(",");
  db.run(
    `UPDATE webhook_events SET read_at = ? WHERE webhook_id = ? AND id IN (${placeholders})`,
    [now, webhook.id, ...ids],
  );
  return json({ ok: true });
}
export async function patchEvent(req, ulidParam, eventIdStr, userId) {
  const eventId = parseInt(eventIdStr, 10);
  if (Number.isNaN(eventId))
    return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const db = getDb();
  const webhook = db
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulidParam, userId);
  if (!webhook)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  let body;
  try {
    body = await req.json();
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
    [readAt, eventId, webhook.id],
  );
  if (r.changes === 0)
    return json({ error: "not_found", message: "Event not found" }, 404);
  const row = db
    .query(
      "SELECT id, webhook_id, title, body, read_at, created_at FROM webhook_events WHERE id = ?",
    )
    .get(eventId);
  return json({
    id: row.id,
    webhook_ulid: ulidParam,
    title: row.title ?? null,
    body: row.body ?? null,
    read_at: row.read_at ?? null,
    created_at: row.created_at,
  });
}
export function deleteEvent(ulidParam, eventIdStr, userId) {
  const eventId = parseInt(eventIdStr, 10);
  if (Number.isNaN(eventId))
    return json({ error: "invalid_request", message: "Invalid event id" }, 400);
  const db = getDb();
  const webhook = db
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulidParam, userId);
  if (!webhook)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  const r = db.run(
    "DELETE FROM webhook_events WHERE id = ? AND webhook_id = ?",
    [eventId, webhook.id],
  );
  if (r.changes === 0)
    return json({ error: "not_found", message: "Event not found" }, 404);
  return new Response(null, { status: 204 });
}
