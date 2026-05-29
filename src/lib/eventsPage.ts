/**
 * Paginate event rows fetched newest-first (DESC) into chronological
 * ascending order for the timeline UI.
 */
export function pageEventsAsc<T>(
  rows: T[],
  limit: number,
): {
  events: T[];
  hasMore: boolean;
} {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { events: [...page].reverse(), hasMore };
}
