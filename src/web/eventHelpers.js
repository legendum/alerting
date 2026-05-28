/**
 * Shared utilities for event merging
 */
/**
 * Merge new events with existing events, avoiding duplicates and updating changed events
 */
export function mergeEvents(existing, newEvents, filterFn) {
  const existingIds = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const event of newEvents) {
    // Apply filter if provided (e.g., filter by webhook_ulid)
    if (filterFn && !filterFn(event)) continue;
    if (!existingIds.has(event.id)) {
      merged.push(event);
    } else {
      // Update existing event if it changed
      const idx = merged.findIndex((e) => e.id === event.id);
      if (idx >= 0) merged[idx] = event;
    }
  }
  // Sort by created_at descending
  merged.sort((a, b) => b.created_at - a.created_at);
  return merged;
}
