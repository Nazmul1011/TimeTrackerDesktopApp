/**
 * Desktop offline queue.
 *
 * Timer, activity, and screenshot events are written to SQLite when the
 * server cannot be reached. A flush sends them in order with the original
 * time. Quit and shutdown still end the session: the next launch closes it
 * at the last moment the app was alive, so powered-off hours are not work.
 */
import { isRetryableError } from "@/lib/timer-outbox";
import { recordOfflineSession, workedSecondsFromEvents } from "@/lib/offline-time";
import { getUserTimezone, ymdInZone } from "@/lib/org-date";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { activityApi } from "@/services/api/activity.api";
import { timerApi, type ReplayTimerEvent } from "@/services/api/timer.api";
import type { ActivityPayload } from "@/services/api/types";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export type TimerQueueEvent = ReplayTimerEvent & {
  sessionStartedAt: string;
};

type SessionStatus = "running" | "paused" | "idle";

type StoredRow = {
  id: number;
  kind: string;
  payload: unknown;
};

const OFFLINE_TOAST = "Tracking on this laptop. It will upload when the connection is back.";

export function offlineSavedMessage(): string {
  return OFFLINE_TOAST;
}

export function shouldQueueTimerError(err: unknown): boolean {
  if (isRetryableError(err)) return true;
  const status =
    typeof err === "object" && err !== null && "response" in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
  return status === 404;
}

function api() {
  return isElectron() ? getElectronAPI()?.sync : undefined;
}

export async function rememberTimerSession(status: SessionStatus): Promise<void> {
  const sync = api();
  const organizationId = useAuthStore.getState().organizationId;
  if (!sync || !organizationId) return;
  const timer = useTimerStore.getState().timer;
  const now = new Date().toISOString();
  try {
    await sync.saveSession({
      organizationId,
      status,
      startedAt: status === "idle" ? null : timer.startedAt,
      lastEventAt: status === "idle" ? null : now,
      projectId: status === "idle" ? null : timer.projectId,
      description: status === "idle" ? null : timer.description || null,
    });
  } catch (err) {
    console.warn("[offline] session save failed", err);
  }
}

export async function listTimerEvents(): Promise<Array<StoredRow & { payload: TimerQueueEvent }>> {
  const sync = api();
  if (!sync) return [];
  try {
    const rows = (await sync.list("timer")) as StoredRow[];
    return rows.flatMap((row) => {
      const payload = row.payload as TimerQueueEvent | null;
      if (!payload?.kind || !payload.occurredAt || !payload.sessionStartedAt) return [];
      return [{ ...row, payload }];
    });
  } catch {
    return [];
  }
}

export async function hasPendingTimerEvents(): Promise<boolean> {
  const rows = await listTimerEvents();
  return rows.length > 0;
}

export async function enqueueTimerEvent(event: TimerQueueEvent): Promise<boolean> {
  const sync = api();
  if (!sync) return false;
  try {
    const result = await sync.enqueue({ kind: "timer", payload: event });
    return result.ok;
  } catch {
    return false;
  }
}

export async function enqueueActivityBatch(activities: ActivityPayload[]): Promise<boolean> {
  const sync = api();
  if (!sync || activities.length === 0) return false;
  try {
    const result = await sync.enqueue({ kind: "activity", payload: { activities } });
    return result.ok;
  } catch {
    return false;
  }
}

export async function clearTimerQueue(): Promise<void> {
  const sync = api();
  if (!sync) return;
  try {
    await sync.clear("timer");
  } catch {
    // ignore
  }
}

let flushing: Promise<void> | null = null;

export function flushOfflineQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = drain().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function drain(): Promise<void> {
  const sync = api();
  if (!sync || !useAuthStore.getState().organizationId) return;

  const timerRows = await listTimerEvents();
  if (timerRows.length > 0) {
    const groups = new Map<string, typeof timerRows>();
    for (const row of timerRows) {
      const key = row.payload.sessionStartedAt;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    const ordered = [...groups.values()].sort((a, b) =>
      a[0].payload.sessionStartedAt.localeCompare(b[0].payload.sessionStartedAt),
    );
    for (const rows of ordered) {
      const events = rows.map((row) => row.payload);
      const sessionStartedAt =
        events.find((event) => event.kind === "start" && !event.synthetic)?.occurredAt ??
        events[0]?.sessionStartedAt;
      if (!sessionStartedAt) continue;
      try {
        const result = await timerApi.replay({
          sessionStartedAt,
          complete: events.some((event) => event.kind === "start" && !event.synthetic),
          events: events.map(({ kind, occurredAt, projectId, description, synthetic }) => ({
            kind,
            occurredAt,
            projectId,
            description,
            synthetic,
          })),
        });
        await sync.ack(rows.map((row) => row.id));
        if (!result?.open) {
          dispatchTimerStopped();
        } else if (result?.reopened === false) {
          const live = useTimerStore.getState().timer;
          if (live.startedAt === sessionStartedAt) {
            useTimerStore.getState().setIdle();
            dispatchTimerStopped();
          }
        }
      } catch (err) {
        const status =
          typeof err === "object" && err !== null && "response" in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (!isRetryableError(err) && status !== 409) {
          console.warn("[offline] timer replay rejected", err);
          await sync.ack(rows.map((row) => row.id));
        } else {
          break;
        }
      }
    }
  }

  try {
    const activityRows = (await sync.list("activity")) as StoredRow[];
    for (const row of activityRows) {
      const activities = (row.payload as { activities?: ActivityPayload[] } | null)?.activities;
      if (!activities?.length) {
        await sync.ack([row.id]);
        continue;
      }
      try {
        await activityApi.bulk(activities);
        await sync.ack([row.id]);
      } catch (err) {
        if (!isRetryableError(err)) {
          await sync.ack([row.id]);
          continue;
        }
        break;
      }
    }
  } catch (err) {
    console.warn("[offline] activity flush failed", err);
  }

  try {
    await sync.flushScreenshots();
  } catch {
    // main process retries on its own loop
  }
}

/**
 * Server has no running timer, but this app still has the clock going.
 * Ask the server to reopen the watchdog's early stop, or keep the local clock
 * if the upload cannot leave the laptop yet.
 */
export async function reopenServerSession(): Promise<void> {
  const timer = useTimerStore.getState().timer;
  if ((timer.status !== "running" && timer.status !== "paused") || !timer.startedAt) return;
  const pending = await listTimerEvents();
  const hasStart = pending.some(
    (row) => row.payload.kind === "start" && row.payload.sessionStartedAt === timer.startedAt,
  );
  if (!hasStart) {
    await enqueueTimerEvent({
      kind: "start",
      occurredAt: timer.startedAt,
      sessionStartedAt: timer.startedAt,
      projectId: timer.projectId ?? undefined,
      description: timer.description || undefined,
      synthetic: true,
    });
  }
  await flushOfflineQueue();
}

/**
 * The process restarted while a timer was open. Close it at the last saved
 * moment so the hours the laptop was off are not counted.
 */
export async function recoverInterruptedSession(): Promise<void> {
  const sync = api();
  const organizationId = useAuthStore.getState().organizationId;
  if (!sync || !organizationId) return;

  let session: Awaited<ReturnType<typeof sync.getSession>>;
  let bootId = "";
  try {
    bootId = await sync.getBootId();
    session = await sync.getSession(organizationId);
  } catch {
    return;
  }
  if (!session || session.status === "idle" || !session.startedAt) {
    await flushOfflineQueue();
    return;
  }
  if (session.bootId === bootId) {
    await flushOfflineQueue();
    return;
  }

  const again = await sync.getSession(organizationId);
  if (!again || again.bootId === bootId || again.startedAt !== session.startedAt) return;

  const pending = await listTimerEvents();
  const startedAt = session.startedAt;
  const occurredAt = session.lastEventAt || startedAt;
  if (!pending.some((row) => row.payload.kind === "start")) {
    await enqueueTimerEvent({
      kind: "start",
      occurredAt: startedAt,
      sessionStartedAt: startedAt,
      projectId: session.projectId ?? undefined,
      description: session.description ?? undefined,
      synthetic: true,
    });
  }
  if (!pending.some((row) => row.payload.kind === "stop")) {
    const queued = await enqueueTimerEvent({
      kind: "stop",
      occurredAt,
      sessionStartedAt: startedAt,
      description: session.description ?? undefined,
    });
    // Tracked offline from its start: count it in today's total right away
    // instead of waiting for the upload.
    const seconds = queued
      ? workedSecondsFromEvents([
          ...pending
            .filter((row) => row.payload.sessionStartedAt === startedAt)
            .map((row) => row.payload),
          { kind: "stop", occurredAt },
        ])
      : null;
    if (seconds) {
      recordOfflineSession({
        sessionStartedAt: startedAt,
        endedAt: occurredAt,
        seconds,
        day: ymdInZone(new Date(occurredAt), getUserTimezone()),
        description: session.description ?? undefined,
        projectId: session.projectId ?? undefined,
      });
    }
  }
  await sync.saveSession({
    organizationId,
    status: "idle",
    startedAt: null,
    lastEventAt: null,
    projectId: null,
    description: null,
  });
  await flushOfflineQueue();
}
