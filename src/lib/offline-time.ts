/**
 * Sessions stopped while offline: the stop is in the upload queue, so the
 * server's totals and timesheet do not include them yet.
 *
 * Today's total, the timeline and the timesheet add these on top of what
 * the server (or its saved copy) says, so offline work shows up at once.
 * An entry is dropped as soon as the queue no longer holds that session,
 * because from then on the server's numbers include it.
 *
 * Kept per user and org in the view cache, so it survives a restart and is
 * removed on logout.
 */
import { readCachedView, writeCachedView } from "@/lib/view-cache";
import { todayInUserZone } from "@/lib/org-date";
import { getElectronAPI, isElectron } from "@/services/electron";

export type OfflineSession = {
  /** The session's start time; also the key the upload queue uses. */
  sessionStartedAt: string;
  endedAt: string;
  /** Worked seconds (pauses already left out). */
  seconds: number;
  /** Calendar day (this device's zone, like the home clock) the time counts for. */
  day: string;
  description?: string;
  projectId?: string;
};

const CACHE_NAME = "offlineSessions";
/** Never keep more than this; old ones would be uploaded or rejected long ago. */
const MAX_SESSIONS = 200;

function readAll(): OfflineSession[] {
  const cached = readCachedView<OfflineSession[]>(CACHE_NAME);
  return Array.isArray(cached?.data) ? cached.data : [];
}

function writeAll(sessions: OfflineSession[]): void {
  writeCachedView(CACHE_NAME, "-", sessions.slice(-MAX_SESSIONS));
}

export function recordOfflineSession(
  session: Omit<OfflineSession, "day"> & { day?: string },
): void {
  if (!session.sessionStartedAt || session.seconds <= 0) return;
  const entry: OfflineSession = { ...session, day: session.day ?? todayInUserZone() };
  const rest = readAll().filter((row) => row.sessionStartedAt !== entry.sessionStartedAt);
  writeAll([...rest, entry]);
}

/**
 * Session start times that still have timer events in the upload queue, or
 * null when the queue cannot be read (then nothing is dropped).
 */
async function queuedSessionStarts(): Promise<Set<string> | null> {
  if (!isElectron()) return new Set();
  const sync = getElectronAPI()?.sync;
  if (!sync) return new Set();
  try {
    const rows = (await sync.list("timer")) as Array<{ payload?: { sessionStartedAt?: string } }>;
    return new Set(
      rows
        .map((row) => row.payload?.sessionStartedAt)
        .filter((value): value is string => Boolean(value)),
    );
  } catch {
    return null;
  }
}

/** Offline sessions the server does not have yet. Drops the ones it has. */
export async function listOfflineSessions(): Promise<OfflineSession[]> {
  const all = readAll();
  if (!all.length) return [];
  const queued = await queuedSessionStarts();
  if (!queued) return all;
  const kept = all.filter((row) => queued.has(row.sessionStartedAt));
  if (kept.length !== all.length) writeAll(kept);
  return kept;
}

/**
 * Worked seconds of one session from its queued clicks, or null when the
 * queue does not hold its real start (it began online, so earlier pauses
 * are unknown and any number would be a guess).
 */
export function workedSecondsFromEvents(
  events: Array<{ kind: string; occurredAt: string; synthetic?: boolean }>,
): number | null {
  const sorted = events
    .map((event) => ({ ...event, at: Date.parse(event.occurredAt) }))
    .filter((event) => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at);
  if (sorted[0]?.kind !== "start" || sorted[0].synthetic) return null;
  let total = 0;
  let runningFrom: number | null = null;
  for (const event of sorted) {
    if (event.kind === "start" || event.kind === "resume") {
      if (runningFrom === null) runningFrom = event.at;
    } else if (event.kind === "pause" || event.kind === "stop") {
      if (runningFrom !== null) total += event.at - runningFrom;
      runningFrom = null;
      if (event.kind === "stop") break;
    }
  }
  return Math.max(0, Math.round(total / 1000));
}

export function offlineSecondsOn(sessions: OfflineSession[], day: string): number {
  return sessions.reduce((sum, row) => (row.day === day ? sum + Math.max(0, row.seconds) : sum), 0);
}
