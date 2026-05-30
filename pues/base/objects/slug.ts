/**
 * Slug derivation + validation for the `slug` role (SPEC §5.13).
 *
 * Pues derives slugs server-side from a configured source column (typically
 * `label`) and writes them to the consumer's `slug` column on every INSERT
 * and on any UPDATE that changes the source value. The consumer's table
 * must carry a `slug` column with a `UNIQUE (<owner>, slug)` index;
 * uniqueness is enforced by the DB and surfaces as a 409 from mountResource.
 *
 * Reserved slugs combine pues' built-in list (the URL prefixes pues itself
 * mounts) with whatever the consumer declares in `resources.<name>.slug.reserved`.
 * Slugs in the reserved set are rejected at the lifecycle layer with a 400.
 */

/** Single-segment URL prefixes pues itself mounts at the app root. A user
 * slug landing on one of these would shadow a pues route. */
export const BUILT_IN_RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "pues",
  "dist",
]);

/** Canonical label → slug conversion. Lower-case, spaces/underscores → `-`,
 * strip anything outside `[a-z0-9.-]`, collapse repeats, strip edge `-`. */
export function toSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Return null if the slug passes both checks, or a human-readable error string. */
export function validateSlug(
  slug: string,
  reserved: ReadonlySet<string>,
): string | null {
  if (!slug) return "slug must contain at least one letter or number";
  if (reserved.has(slug)) return `slug "${slug}" is reserved`;
  return null;
}
