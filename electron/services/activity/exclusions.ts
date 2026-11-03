/**
 * Application exclusion list — apps whose activity is never recorded.
 *
 * Built-in entries always apply. More can be added through the
 * `excludedApps` desktop setting (persisted in electron-store, so it survives
 * restarts). Every upload path in the main process checks this list before
 * anything leaves the machine.
 */
import log from "electron-log/main";

/** Always excluded, whatever the settings say. */
export const BUILT_IN_EXCLUDED_APPS: readonly string[] = ["TeamLogger"];

/**
 * Lower-case and drop spaces, dots, dashes and underscores so
 * "Team Logger", "team-logger", "TeamLogger.exe" and "com.teamlogger.app"
 * all reduce to something containing "teamlogger".
 */
export function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[\s._\-–—]+/g, "");
}

type Matcher = { key: string; tokens: string[] };
let cached: Matcher | null = null;

function readUserExclusions(): string[] {
  // Plain Node (the verify script) has no app settings; built-ins only.
  if (!process.versions.electron) return [];
  try {
    // Lazy require keeps this module free of an electron-store dependency in
    // plain Node checks and avoids an import cycle with settings.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SettingsService } = require("../settings") as typeof import("../settings");
    return SettingsService.getInstance().get().excludedApps;
  } catch (error) {
    log.warn("[AppExclusions] could not read excludedApps setting — using built-ins", error);
    return [];
  }
}

/** Short tokens would match too much ("ab" is inside many names). */
function toNeedles(list: readonly string[]): string[] {
  return Array.from(new Set(list.map(normalizeForMatch).filter((token) => token.length >= 3)));
}

function currentNeedles(): string[] {
  const list = [...BUILT_IN_EXCLUDED_APPS, ...readUserExclusions()];
  const key = list.join("\u0000");
  if (cached?.key !== key) cached = { key, tokens: toNeedles(list) };
  return cached.tokens;
}

function matchNeedles(values: Array<string | null | undefined>, needles: string[]): boolean {
  return values.some((value) => {
    const hay = normalizeForMatch(value);
    return hay.length > 0 && needles.some((needle) => hay.includes(needle));
  });
}

/** Match against an explicit list instead of settings (used by checks). */
export function matchesExclusion(
  values: Array<string | null | undefined>,
  list: readonly string[],
): boolean {
  return matchNeedles(values, toNeedles(list));
}

/**
 * True when any identifying field (app name, window title, exe / bundle path)
 * belongs to an excluded app. Checking the process path as well as the name
 * keeps the match stable when the app renames its window.
 *
 * Fails closed: if matching throws, the sample is treated as excluded so a
 * detection error can never leak an excluded app.
 */
export function isExcludedApp(info: {
  appName?: string | null;
  windowTitle?: string | null;
  bundlePath?: string | null;
  exePath?: string | null;
}): boolean {
  try {
    return matchNeedles(
      [info.appName, info.windowTitle, info.bundlePath, info.exePath],
      currentNeedles(),
    );
  } catch (error) {
    log.warn("[AppExclusions] match failed — treating sample as excluded", error);
    return true;
  }
}

/** Activity payloads from the renderer / offline outbox. */
export function isExcludedActivityPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as { appName?: unknown; windowTitle?: unknown };
  return isExcludedApp({
    appName: typeof row.appName === "string" ? row.appName : null,
    windowTitle: typeof row.windowTitle === "string" ? row.windowTitle : null,
  });
}
