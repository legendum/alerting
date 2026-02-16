/**
 * Format a 24-hour hour (0-23) as 12-hour format with am/pm
 */
export function formatMailHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}
