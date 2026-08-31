/**
 * Project picker icons from Figma App / Timesheet (17624:23126).
 * General / inbox uses the folder mark; others cycle diamond and circle.
 */

const MENU_ICONS = [
  "/figma/icon-project-inbox.svg",
  "/figma/icon-project-diamond.svg",
  "/figma/icon-project-circle.svg",
] as const;

/** Figma menu icon by list position: inbox → diamond → circle. */
export function projectMenuIcon(index: number): string {
  return MENU_ICONS[index % MENU_ICONS.length];
}

/** Menu badge — `03:43` (always two-digit hours). */
export function formatProjectHhMm(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Trigger badge beside project name — `3:43:55` (Figma 17623:47844). */
export function formatProjectTriggerTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatTimesheetDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}`;
  return `00:${String(minutes).padStart(2, "0")}`;
}

export function codeFromProjectName(name: string): string {
  const slug =
    name
      .replace(/[^a-zA-Z0-9]+/g, "")
      .slice(0, 8)
      .toUpperCase() || "PROJ";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${suffix}`;
}
