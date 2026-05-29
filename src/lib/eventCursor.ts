/** Composite cursor for backward pagination (`created_at` + `id`). */

export type EventCursor = { created_at: number; id: number };

export function parseEventCursor(raw: string | null): EventCursor | null {
  if (!raw) return null;
  const [a, b] = raw.split(":");
  const created_at = Number(a);
  const id = Number(b);
  if (!Number.isFinite(created_at) || !Number.isInteger(id) || id <= 0)
    return null;
  return { created_at, id };
}

export function encodeEventCursor(created_at: number, id: number): string {
  return `${created_at}:${id}`;
}

/** SQL fragment for rows strictly older than `cursor` (DESC page walk). */
export function olderThanCursorSql(
  createdAtCol: string,
  idCol: string,
): string {
  return ` AND (${createdAtCol} < ? OR (${createdAtCol} = ? AND ${idCol} < ?))`;
}
