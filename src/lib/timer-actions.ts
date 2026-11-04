/**
 * Timer pause / resume / stop used by the window UI and the menu-bar tray.
 */
import { toast } from "sonner";
import { formatElapsed } from "@/lib/dayjs";
import {
  clearTimerQueue,
  enqueueTimerEvent,
  flushOfflineQueue,
  hasPendingTimerEvents,
  listTimerEvents,
  offlineSavedMessage,
  rememberTimerSession,
  shouldQueueTimerError,
} from "@/lib/offline-sync";
import { sanitizeProjectId } from "@/lib/project";
import { clearIdlePaused } from "@/lib/idle-pause-state";
import { recordOfflineSession } from "@/lib/offline-time";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { cancelWindowReveal } from "@/lib/window-reveal";
import { getElectronAPI, isElectron } from "@/services/electron";
import { timerApi } from "@/services/api/timer.api";
import { isAppOnline } from "@/store/connection.store";
import { useTimerStore } from "@/store/timer.store";
import { getUserTimezone } from "@/lib/org-date";

let busy = false;
let actionSeq = 0;
let uploadChain: Promise<void> = Promise.resolve();

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function runTimerMutation(fn: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  useTimerStore.getState().setSyncing(true);
  try {
    await fn();
  } finally {
    useTimerStore.getState().setSyncing(false);
    busy = false;
  }
}

type TimerClick = {
  seq: number;
  occurredAt: string;
  sessionStartedAt: string;
  projectId?: string;
  description?: string;
};

function httpStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "response" in err) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

function liveElapsedMs(): number {
  const store = useTimerStore.getState();
  if (store.timer.status === "running" && store.segmentStartedAt) {
    return store.baseElapsedMs + (Date.now() - store.segmentStartedAt);
  }
  return store.timer.elapsedMs;
}

function isCurrent(seq: number): boolean {
  return seq === actionSeq;
}

/** Runs after the clock has already changed. Later clicks wait their turn here. */
function enqueueUpload(task: () => Promise<void>): void {
  uploadChain = uploadChain.then(task, task).then(
    () => undefined,
    () => undefined,
  );
}

/** Quit waits for this so a stop is saved before the app closes. */
export function whenTimerUploadsFinish(): Promise<void> {
  return uploadChain;
}

async function sendOlderEventsFirst(): Promise<void> {
  if (await hasPendingTimerEvents()) {
    await flushOfflineQueue();
  }
}

async function queueClick(
  kind: "start" | "pause" | "resume" | "stop",
  click: TimerClick,
  synthetic = false,
): Promise<boolean> {
  return enqueueTimerEvent({
    kind,
    occurredAt: click.occurredAt,
    sessionStartedAt: click.sessionStartedAt,
    projectId: click.projectId,
    description: click.description,
    synthetic,
  });
}

/**
 * "Saved on this laptop" message after a queued click. Skipped while the
 * offline banner is up: it already says the same thing on every screen.
 */
function notifyOfflineSaved(): void {
  if (!isAppOnline()) return;
  toast.message(offlineSavedMessage());
}

function notify(title: string, body: string): void {
  if (!isElectron()) return;
  void getElectronAPI()?.notification?.show?.({ title, body });
}

/**
 * The clock changes before this returns. The server is told afterwards and
 * given up on after a few seconds. The click is queued only when that call
 * fails, so a success is not uploaded a second time.
 */
export function startTimer(projectId?: string | null): void {
  const store = useTimerStore.getState();
  if (store.timer.status !== "idle" || busy) return;
  busy = true;
  clearIdlePaused();
  try {
    store.ensureToday();
    const resolved = projectId !== undefined ? projectId : store.selectedProjectId;
    store.setProject(resolved ?? null);
    const occurredAt = new Date().toISOString();
    const resolvedProjectId = sanitizeProjectId(resolved);
    const description = store.timer.description || undefined;
    const seq = ++actionSeq;
    store.applyElapsedSeconds(0, "running", {
      id: "local",
      startedAt: occurredAt,
      projectId: resolvedProjectId ?? null,
      description: description ?? "",
    });
    void rememberTimerSession("running");
    cancelWindowReveal();
    const click: TimerClick = {
      seq,
      occurredAt,
      sessionStartedAt: occurredAt,
      projectId: resolvedProjectId,
      description,
    };
    enqueueUpload(async () => {
      try {
        await sendOlderEventsFirst();
        const apiTimer = await timerApi.start({
          projectId: click.projectId,
          description: click.description,
          occurredAt: click.occurredAt,
        });
        if (!isCurrent(seq)) return;
        useTimerStore.getState().hydrateFromApi(apiTimer);
        void rememberTimerSession("running");
      } catch (err) {
        if (httpStatus(err) === 409) {
          if (!isCurrent(seq)) return;
          try {
            const current = await timerApi.current();
            if (!isCurrent(seq)) return;
            useTimerStore.getState().hydrateFromApi(current);
            const next = useTimerStore.getState().timer.status;
            void rememberTimerSession(
              next === "paused" ? "paused" : next === "running" ? "running" : "idle",
            );
          } catch {
            // keep the clock that was shown on click
          }
          return;
        }
        if (!shouldQueueTimerError(err)) {
          if (isCurrent(seq)) {
            useTimerStore.getState().setIdle();
            toast.error(getErrorMessage(err, "Failed to start timer"));
          }
          return;
        }
        const queued = await queueClick("start", click);
        if (!queued) {
          if (isCurrent(seq)) {
            useTimerStore.getState().setIdle();
            toast.error(getErrorMessage(err, "Failed to start timer"));
          }
          return;
        }
        if (isCurrent(seq)) notifyOfflineSaved();
        void flushOfflineQueue();
      }
    });
  } finally {
    busy = false;
  }
}

export async function pauseTimer(): Promise<void> {
  const store = useTimerStore.getState();
  if (store.timer.status !== "running" || busy || !store.timer.startedAt) return;
  busy = true;
  clearIdlePaused();
  try {
    const occurredAt = new Date().toISOString();
    const liveMs = liveElapsedMs();
    const seq = ++actionSeq;
    const click: TimerClick = {
      seq,
      occurredAt,
      sessionStartedAt: store.timer.startedAt,
      projectId: store.timer.projectId ?? undefined,
      description: store.timer.description || undefined,
    };
    store.applyElapsedSeconds(liveMs / 1000, "paused", { pausedAt: occurredAt });
    cancelWindowReveal();
    void rememberTimerSession("paused");
    if (isElectron()) void getElectronAPI()?.tracking.disarmIdleResume?.("manual pause");
    notify("Timer paused", "Click Resume when you are ready.");
    enqueueUpload(async () => {
      try {
        await sendOlderEventsFirst();
        const apiTimer = await timerApi.pause({ occurredAt: click.occurredAt });
        if (!isCurrent(seq)) return;
        useTimerStore.getState().hydrateFromApi(apiTimer);
        void rememberTimerSession("paused");
      } catch (err) {
        if (!shouldQueueTimerError(err)) {
          if (isCurrent(seq)) {
            useTimerStore.getState().applyElapsedSeconds(liveMs / 1000, "running");
            toast.error(getErrorMessage(err, "Failed to pause timer"));
          }
          return;
        }
        const queued = await queueClick("pause", click);
        if (!queued) {
          if (isCurrent(seq)) {
            useTimerStore.getState().applyElapsedSeconds(liveMs / 1000, "running");
            toast.error(getErrorMessage(err, "Failed to pause timer"));
          }
          return;
        }
        if (isCurrent(seq)) notifyOfflineSaved();
        void flushOfflineQueue();
      }
    });
  } finally {
    busy = false;
  }
}

export async function resumeTimer(): Promise<void> {
  const store = useTimerStore.getState();
  if (store.timer.status !== "paused" || busy || !store.timer.startedAt) return;
  busy = true;
  clearIdlePaused();
  try {
    const occurredAt = new Date().toISOString();
    const pausedMs = store.timer.elapsedMs;
    const seq = ++actionSeq;
    const click: TimerClick = {
      seq,
      occurredAt,
      sessionStartedAt: store.timer.startedAt,
      projectId: store.timer.projectId ?? undefined,
      description: store.timer.description || undefined,
    };
    store.applyElapsedSeconds(pausedMs / 1000, "running");
    void rememberTimerSession("running");
    notify("Timer resumed", "Tracking is running.");
    enqueueUpload(async () => {
      try {
        await sendOlderEventsFirst();
        const apiTimer = await timerApi.resume({ occurredAt: click.occurredAt });
        if (!isCurrent(seq)) return;
        useTimerStore.getState().hydrateFromApi(apiTimer);
        void rememberTimerSession("running");
      } catch (err) {
        if (!shouldQueueTimerError(err)) {
          if (isCurrent(seq)) {
            useTimerStore.getState().applyElapsedSeconds(pausedMs / 1000, "paused", {
              pausedAt: click.occurredAt,
            });
            toast.error(getErrorMessage(err, "Failed to resume timer"));
          }
          return;
        }
        const queued = await queueClick("resume", click);
        if (!queued) {
          if (isCurrent(seq)) {
            useTimerStore.getState().applyElapsedSeconds(pausedMs / 1000, "paused", {
              pausedAt: click.occurredAt,
            });
            toast.error(getErrorMessage(err, "Failed to resume timer"));
          }
          return;
        }
        if (isCurrent(seq)) notifyOfflineSaved();
        void flushOfflineQueue();
      }
    });
  } finally {
    busy = false;
  }
}

export async function stopTimer(options?: {
  silent?: boolean;
  skipTodaySync?: boolean;
}): Promise<boolean> {
  const store = useTimerStore.getState();
  const status = store.timer.status;
  if ((status !== "running" && status !== "paused") || busy || !store.timer.startedAt) {
    return false;
  }
  busy = true;
  clearIdlePaused();
  try {
    const sessionSeconds = Math.max(0, Math.round(liveElapsedMs() / 1000));
    const previousLogged = store.todayLoggedMs;
    const occurredAt = new Date().toISOString();
    const seq = ++actionSeq;
    const click: TimerClick = {
      seq,
      occurredAt,
      sessionStartedAt: store.timer.startedAt,
      projectId: store.timer.projectId ?? undefined,
      description: store.timer.description || undefined,
    };
    store.setIdle();
    cancelWindowReveal();
    if (!options?.skipTodaySync && sessionSeconds > 0) {
      store.setTodayLoggedSeconds(previousLogged / 1000 + sessionSeconds);
    }
    void rememberTimerSession("idle");
    enqueueUpload(async () => {
      try {
        await sendOlderEventsFirst();
        const result = await timerApi.stop({
          description: click.description,
          occurredAt: click.occurredAt,
        });
        const rows = result?.entries ?? [];
        const fromEntries = rows.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
        const explicit = result?.totalDurationSeconds;
        const savedSeconds =
          typeof explicit === "number" ? explicit : fromEntries > 0 ? fromEntries : sessionSeconds;
        if (isCurrent(seq) && !options?.skipTodaySync) {
          useTimerStore.getState().setTodayLoggedSeconds(previousLogged / 1000 + savedSeconds);
        }
        dispatchTimerStopped({
          totalDurationSeconds: savedSeconds,
          entryCount: result?.count ?? rows.length,
        });
        if (isCurrent(seq) && !options?.silent) {
          if (savedSeconds > 0) {
            toast.success(`Saved ${formatElapsed(savedSeconds * 1000)} to timesheet`);
          } else {
            toast.success("Timer stopped");
          }
        }
      } catch (err) {
        if (!shouldQueueTimerError(err)) {
          if (isCurrent(seq)) {
            toast.error(getErrorMessage(err, "Failed to stop timer"));
            useTimerStore.getState().setTodayLoggedSeconds(previousLogged / 1000);
            try {
              const current = await timerApi.current();
              if (isCurrent(seq)) useTimerStore.getState().hydrateFromApi(current);
            } catch {
              // keep the stopped clock
            }
          }
          return;
        }
        const pending = await listTimerEvents();
        if (!pending.some((row) => row.payload.kind === "start")) {
          await enqueueTimerEvent({
            kind: "start",
            occurredAt: click.sessionStartedAt,
            sessionStartedAt: click.sessionStartedAt,
            projectId: click.projectId,
            description: click.description,
            synthetic: true,
          });
        }
        const queued = await queueClick("stop", click);
        if (!queued) {
          if (isCurrent(seq)) {
            toast.error(getErrorMessage(err, "Failed to stop timer"));
            useTimerStore.getState().setTodayLoggedSeconds(previousLogged / 1000);
          }
          return;
        }
        recordOfflineSession({
          sessionStartedAt: click.sessionStartedAt,
          endedAt: click.occurredAt,
          seconds: sessionSeconds,
          description: click.description,
          projectId: click.projectId,
        });
        dispatchTimerStopped({ totalDurationSeconds: sessionSeconds, entryCount: 0 });
        if (isCurrent(seq) && !options?.silent) notifyOfflineSaved();
        void flushOfflineQueue();
      }
    });
    return true;
  } finally {
    busy = false;
  }
}

/**
 * Fully reset today's tracked time to 00:00:00:
 * Discards any active session and deletes today's timesheet + activity logs on backend & desktop.
 */
export async function resetDayTimer(): Promise<boolean> {
  let ok = false;
  await runTimerMutation(async () => {
    try {
      await timerApi.resetDay(getUserTimezone());
      clearIdlePaused();
      await clearTimerQueue();
      await rememberTimerSession("idle");
      const store = useTimerStore.getState();
      const currentProject = store.selectedProjectId;
      store.reset();
      store.setProject(currentProject);
      dispatchTimerStopped({ totalDurationSeconds: 0, entryCount: 0 });
      cancelWindowReveal();
      toast.success("Today’s time was reset to 00:00:00");
      ok = true;
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to reset today's time"));
    }
  });
  return ok;
}

/** Picker change: stop the live session so time stays on the project it was tracked for. */
export async function selectProject(projectId: string | null): Promise<void> {
  const next =
    projectId == null || projectId === "" ? null : (sanitizeProjectId(projectId) ?? null);
  const store = useTimerStore.getState();
  const current = store.timer.projectId ?? null;
  const status = store.timer.status;
  const switchingAway = current !== next && (status === "running" || status === "paused");

  if (switchingAway) {
    const ok = await stopTimer();
    if (!ok) return;
  }

  useTimerStore.getState().setProject(next);
}
