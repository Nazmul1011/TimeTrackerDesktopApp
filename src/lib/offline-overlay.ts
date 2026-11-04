/**
 * Work recorded on this laptop that the server does not have yet, shaped
 * like the server's own rows so screens can draw it next to them:
 * - sessions stopped offline (from lib/offline-time),
 * - app usage waiting in the upload queue,
 * - screenshots waiting in the upload queue (small previews from main).
 *
 * Ids start with OFFLINE_ID_PREFIX so screens can mark these rows as
 * "waiting to upload" and keep them out of edit and delete actions.
 */
import { listOfflineSessions } from "@/lib/offline-time";
import type { ApiScreenshot } from "@/services/api/screenshot.api";
import type { ApiTimeEntry } from "@/services/api/timesheet.api";
import type { ActivityPayload } from "@/services/api/types";
import { getElectronAPI, isElectron } from "@/services/electron";

export const OFFLINE_ID_PREFIX = "pending-offline-";

export function isOfflineRowId(id: string | null | undefined): boolean {
  return Boolean(id?.startsWith(OFFLINE_ID_PREFIX));
}

/** Same shape as one row of GET /activity/timeline. */
export type QueuedActivityRow = {
  app: string;
  window: string;
  start: string;
  end: string;
  duration: number;
};

export type OfflineOverlay = {
  entries: ApiTimeEntry[];
  activity: QueuedActivityRow[];
  shots: Array<ApiScreenshot & { pendingUpload: true }>;
};

const EMPTY: OfflineOverlay = { entries: [], activity: [], shots: [] };

function overlaps(
  startMs: number,
  endMs: number,
  range?: { startMs: number; endMs: number },
): boolean {
  if (!range) return true;
  return endMs > range.startMs && startMs < range.endMs;
}

async function queuedActivity(range?: {
  startMs: number;
  endMs: number;
}): Promise<QueuedActivityRow[]> {
  const sync = getElectronAPI()?.sync;
  if (!sync) return [];
  try {
    const rows = (await sync.list("activity")) as Array<{
      payload?: { activities?: ActivityPayload[] };
    }>;
    return rows.flatMap((row) =>
      (row.payload?.activities ?? []).flatMap((item) => {
        if (!item?.appName || item.isIdle) return [];
        const startMs = Date.parse(item.timestamp);
        const seconds = Number(item.duration);
        if (!Number.isFinite(startMs) || !Number.isFinite(seconds) || seconds <= 0) return [];
        const endMs = startMs + seconds * 1000;
        if (!overlaps(startMs, endMs, range)) return [];
        return [
          {
            app: item.appName,
            window: item.windowTitle ?? "",
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
            duration: seconds,
          },
        ];
      }),
    );
  } catch {
    return [];
  }
}

async function queuedShots(range?: {
  startMs: number;
  endMs: number;
}): Promise<OfflineOverlay["shots"]> {
  const sync = getElectronAPI()?.sync;
  if (!sync?.pendingScreenshots) return [];
  try {
    const list = await sync.pendingScreenshots();
    return (list ?? []).flatMap((shot) => {
      const at = Date.parse(shot.capturedAt);
      if (!Number.isFinite(at) || !overlaps(at, at + 1, range)) return [];
      return [
        {
          id: shot.id,
          imageUrl: shot.imageUrl,
          capturedAt: shot.capturedAt,
          appName: shot.appName,
          activityPercent: shot.activityPercent,
          pendingUpload: true as const,
        },
      ];
    });
  } catch {
    return [];
  }
}

export type OverlayParts = { sessions?: boolean; activity?: boolean; shots?: boolean };

const ALL_PARTS: OverlayParts = { sessions: true, activity: true, shots: true };

/**
 * Offline work, limited to `range` when given (e.g. the day on screen).
 * Ask only for the parts you draw: screenshot previews are large.
 */
export async function loadOfflineOverlay(
  range?: { startMs: number; endMs: number },
  parts: OverlayParts = ALL_PARTS,
): Promise<OfflineOverlay> {
  if (!isElectron()) return EMPTY;
  const [sessions, activity, shots] = await Promise.all([
    parts.sessions ? listOfflineSessions() : Promise.resolve([]),
    parts.activity ? queuedActivity(range) : Promise.resolve([]),
    parts.shots ? queuedShots(range) : Promise.resolve([]),
  ]);
  const entries = sessions.flatMap((session): ApiTimeEntry[] => {
    const startMs = Date.parse(session.sessionStartedAt);
    const endMs = Date.parse(session.endedAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
    if (!overlaps(startMs, endMs, range)) return [];
    return [
      {
        id: `${OFFLINE_ID_PREFIX}${session.sessionStartedAt}`,
        date: session.day,
        startTime: session.sessionStartedAt,
        endTime: session.endedAt,
        duration: session.seconds,
        description: session.description ?? null,
        projectId: session.projectId ?? null,
        project: null,
        source: "offline",
      },
    ];
  });
  return { entries, activity, shots };
}

/** One app's time today, as in GET /activity/apps. */
export type AppUsageRow = { appName: string; totalDuration: number; percent: number };

/**
 * Adds app time still waiting to upload. Shares are worked out again only
 * when something was added, so normal server numbers stay as they are.
 */
export function addQueuedAppUsage(
  rows: AppUsageRow[],
  queued: Array<{ app: string; duration: number }>,
): AppUsageRow[] {
  if (!queued.length) return rows;
  const totals = new Map(rows.map((row) => [row.appName, row.totalDuration]));
  for (const item of queued) {
    totals.set(item.app, (totals.get(item.app) ?? 0) + Math.max(0, item.duration));
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  return [...totals.entries()]
    .map(([appName, totalDuration]) => ({
      appName,
      totalDuration,
      percent: sum > 0 ? Math.round((totalDuration / sum) * 100) : 0,
    }))
    .sort((a, b) => b.totalDuration - a.totalDuration);
}
