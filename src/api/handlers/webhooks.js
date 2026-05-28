import { loadConfig } from "../../lib/config.js";
import { getDb } from "../../lib/db.js";
import { ulid } from "../../lib/ulid.js";
import { json } from "../json.js";

const config = loadConfig();
const domain = config.domain;
function parsePolicy(p) {
  if (p == null)
    return JSON.stringify({ email_schedule: "never", retention_days: 7 });
  if (typeof p === "object") return JSON.stringify(p);
  return JSON.stringify({ email_schedule: "never", retention_days: 7 });
}
export function listWebhooks(userId) {
  const db = getDb();
  const rows = db
    .query(
      "SELECT ulid, name, description, policy, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(userId);
  const webhooks = rows.map((r) => ({
    ulid: r.ulid,
    name: r.name,
    description: r.description ?? null,
    policy: r.policy
      ? JSON.parse(r.policy)
      : { email_schedule: "never", retention_days: 7 },
    url: `${domain}/w/${r.ulid}`,
    created_at: r.created_at,
  }));
  return json({ webhooks });
}
export async function createWebhook(req, userId) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const name = body.name?.trim();
  if (!name)
    return json({ error: "invalid_request", message: "name is required" }, 400);
  const description = body.description?.trim() ?? null;
  const policy = parsePolicy(body.policy);
  const webhookUlid = ulid();
  const db = getDb();
  db.run(
    "INSERT INTO webhooks (user_id, ulid, name, description, policy) VALUES (?, ?, ?, ?, ?)",
    [userId, webhookUlid, name, description, policy],
  );
  const created = db
    .query("SELECT created_at FROM webhooks WHERE ulid = ?")
    .get(webhookUlid);
  return json(
    {
      ulid: webhookUlid,
      name,
      description,
      policy: JSON.parse(policy),
      url: `${domain}/w/${webhookUlid}`,
      created_at: created.created_at,
    },
    201,
  );
}
export function getWebhook(ulidParam, userId) {
  const db = getDb();
  const row = db
    .query(
      "SELECT ulid, name, description, policy, created_at FROM webhooks WHERE ulid = ? AND user_id = ?",
    )
    .get(ulidParam, userId);
  if (!row)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  return json({
    ulid: row.ulid,
    name: row.name,
    description: row.description ?? null,
    policy: row.policy
      ? JSON.parse(row.policy)
      : { email_schedule: "never", retention_days: 7 },
    url: `${domain}/w/${row.ulid}`,
    created_at: row.created_at,
  });
}
export async function patchWebhook(req, ulidParam, userId) {
  const db = getDb();
  const row = db
    .query("SELECT id FROM webhooks WHERE ulid = ? AND user_id = ?")
    .get(ulidParam, userId);
  if (!row)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_request", message: "Invalid JSON" }, 400);
  }
  const updates = [];
  const params = [];
  if (body.name !== undefined) {
    updates.push("name = ?");
    params.push(body.name.trim());
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    params.push(body.description?.trim() ?? null);
  }
  if (body.policy !== undefined) {
    updates.push("policy = ?");
    params.push(parsePolicy(body.policy));
  }
  let outUlid = ulidParam;
  if (body.regenerate_ulid) {
    outUlid = ulid();
    updates.push("ulid = ?");
    params.push(outUlid);
  }
  if (params.length > 0) {
    params.push(ulidParam, userId);
    db.run(
      `UPDATE webhooks SET ${updates.join(", ")} WHERE ulid = ? AND user_id = ?`,
      params,
    );
  }
  const updated = db
    .query(
      "SELECT name, description, policy, created_at FROM webhooks WHERE ulid = ?",
    )
    .get(outUlid);
  return json({
    ulid: outUlid,
    name: updated.name,
    description: updated.description ?? null,
    policy: updated.policy
      ? JSON.parse(updated.policy)
      : { email_schedule: "never", retention_days: 7 },
    url: `${domain}/w/${outUlid}`,
    created_at: updated.created_at,
  });
}
export function deleteWebhook(ulidParam, userId) {
  const db = getDb();
  const r = db.run("DELETE FROM webhooks WHERE ulid = ? AND user_id = ?", [
    ulidParam,
    userId,
  ]);
  if (r.changes === 0)
    return json({ error: "not_found", message: "Webhook not found" }, 404);
  return new Response(null, { status: 204 });
}
