/**
 * Project picker helpers — General = no specific project (null projectId).
 *
 * Backend project IDs are Prisma CUIDs (`@default(cuid())`), not UUIDs.
 */

/** Bucket key for today's time logged without a project. */
export const GENERAL_TIME_KEY = "__general__";

export const GENERAL_PROJECT = {
  id: null as null,
  name: "General",
} as const;

/** Accept cuid / uuid / other non-empty Prisma string ids. Reject empty & sentinels. */
export function isValidProjectId(id: string | null | undefined): id is string {
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed === GENERAL_TIME_KEY) return false;
  // Prisma cuid (~25), cuid2, uuid (36) — keep a sane upper bound
  if (trimmed.length < 8 || trimmed.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
}

/** Strip invalid / empty ids so the API never receives `projectId: ""`. */
export function sanitizeProjectId(
  id: string | null | undefined,
): string | undefined {
  if (id == null) return undefined;
  const trimmed = id.trim();
  return isValidProjectId(trimmed) ? trimmed : undefined;
}
