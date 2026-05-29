export type Event = {
  id: number;
  webhook_ulid?: string;
  title: string | null;
  body: string | null;
  read_at: number | null;
  created_at: number;
};

export function mergeEvents<T extends Event>(
  existing: T[],
  newEvents: T[],
  filterFn?: (event: T) => boolean,
): T[] {
  const existingIds = new Set(existing.map((e) => e.id));
  const merged = [...existing];

  for (const event of newEvents) {
    // Apply filter if provided (e.g., filter by webhook_ulid)
    if (filterFn && !filterFn(event as T)) continue;

    if (!existingIds.has(event.id)) {
      merged.push(event as T);
    } else {
      // Update existing event if it changed
      const idx = merged.findIndex((e) => e.id === event.id);
      if (idx >= 0) merged[idx] = event as T;
    }
  }

  merged.sort((a, b) => a.created_at - b.created_at || a.id - b.id);
  return merged;
}
