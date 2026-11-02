/**
 * Timer pause / resume / stop used by the window UI and the menu-bar tray.
 */
import { toast } from "sonner";
import { formatElapsed } from "@/lib/dayjs";
import { isNetworkError } from "@/lib/network";
import { sanitizeProjectId } from "@/lib/project";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { getElectronAPI, isElectron } from "@/services/electron";
import { timerApi } from "@/services/api/timer.api";
import {
  canQueueOffline,
  enqueueTimerEvent,
  persistLocalTimer,
  shouldQueueTimerEvent,
} from "@/services/timer/offline-persist";
import { useTimerStore } from "@/store/timer.store";
import { getUserTimezone } from "@/lib/org-date";

let busy = false;

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

export async function pauseTimer(): Promise<void> {
  if (useTimerStore.getState().timer.status !== "running") return;
  await runTimerMutation(async () => {
    const occurredAt = new Date().toISOString();
    const announcePaused = () => {
      if (isElectron()) {
        void getElectronAPI()?.tracking.disarmIdleResume?.();
        void getElectronAPI()?.notification?.show?.({
          title: "Timer paused",
          body: "Click Resume when you are ready.",
        });
      }
    };
    const pauseOffline = async () => {
      useTimerStore.getState().applyLocalPause();
      await enqueueTimerEvent({ type: "pause", occurredAt });
      announcePaused();
      toast.message("Paused offline — will sync when you are back online");
    };
    try {
      if (shouldQueueTimerEvent()) {
        await pauseOffline();
        return;
      }
      const apiTimer = await timerApi.pause({ occurredAt });
      useTimerStore.getState().hydrateFromApi(apiTimer);
      persistLocalTimer();
      announcePaused();
    } catch (err) {
      if (canQueueOffline() && isNetworkError(err)) {
        await pauseOffline();
        return;
      }
      toast.error(getErrorMessage(err, "Failed to pause timer"));
    }
  });
}

export async function resumeTimer(): Promise<void> {
  if (useTimerStore.getState().timer.status !== "paused") return;
  await runTimerMutation(async () => {
    const occurredAt = new Date().toISOString();
    const announceResumed = () => {
      if (isElectron()) {
        void getElectronAPI()?.notification?.show?.({
          title: "Timer resumed",
          body: "Tracking is running.",
        });
      }
    };
    const resumeOffline = async () => {
      useTimerStore.getState().applyLocalResume();
      await enqueueTimerEvent({ type: "resume", occurredAt });
      announceResumed();
      toast.message("Resumed offline — will sync when you are back online");
    };
    try {
      if (shouldQueueTimerEvent()) {
        await resumeOffline();
        return;
      }
      const apiTimer = await timerApi.resume({ occurredAt });
      useTimerStore.getState().hydrateFromApi(apiTimer);
      persistLocalTimer();
      announceResumed();
    } catch (err) {
      if (canQueueOffline() && isNetworkError(err)) {
        await resumeOffline();
        return;
      }
      toast.error(getErrorMessage(err, "Failed to resume timer"));
    }
  });
}

export async function stopTimer(options?: {
  silent?: boolean;
  skipTodaySync?: boolean;
}): Promise<boolean> {
  const status = useTimerStore.getState().timer.status;
  if (status !== "running" && status !== "paused") return false;
  let ok = false;
  await runTimerMutation(async () => {
    const store = useTimerStore.getState();
    const occurredAt = new Date().toISOString();
    const sessionSeconds = Math.max(0, Math.round(store.timer.elapsedMs / 1000));
    const stopOffline = async () => {
      const description = store.timer.description;
      const previousLogged = store.todayLoggedMs;
      await enqueueTimerEvent({
        type: "stop",
        occurredAt,
        description: description || undefined,
      });
      const next = useTimerStore.getState();
      next.setIdle();
      next.setOfflineSession(true);
      if (sessionSeconds > 0) {
        next.setTodayLoggedSeconds(previousLogged / 1000 + sessionSeconds);
      }
      persistLocalTimer();
      dispatchTimerStopped({
        totalDurationSeconds: sessionSeconds,
        entryCount: sessionSeconds > 0 ? 1 : 0,
      });
      if (!options?.silent) {
        toast.success(
          sessionSeconds > 0
            ? `Saved ${formatElapsed(sessionSeconds * 1000)} locally — will sync online`
            : "Timer stopped offline — will sync when you are back online",
        );
      }
      ok = true;
    };
    try {
      if (shouldQueueTimerEvent()) {
        await stopOffline();
        return;
      }
      // Read before the request: the realtime `timer:stopped` event can land
      // first and already add this session to the total.
      const previousLogged = store.todayLoggedMs;
      const result = await timerApi.stop({
        description: store.timer.description || undefined,
        occurredAt,
      });
      const rows = result?.entries ?? [];
      const fromEntries = rows.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
      const savedSeconds = result?.totalDurationSeconds || fromEntries || sessionSeconds;
      useTimerStore.getState().setIdle();
      persistLocalTimer();
      if (!options?.skipTodaySync) {
        if (savedSeconds > 0) {
          useTimerStore.getState().setTodayLoggedSeconds(previousLogged / 1000 + savedSeconds);
        }
        // Listeners reload today's total from the server in the background;
        // the buttons must not wait for it.
        dispatchTimerStopped({
          totalDurationSeconds: savedSeconds,
          entryCount: result?.count ?? rows.length,
        });
      } else {
        dispatchTimerStopped({
          totalDurationSeconds: savedSeconds,
          entryCount: result?.count ?? rows.length,
        });
      }
      if (!options?.silent) {
        if (savedSeconds > 0) {
          toast.success(`Saved ${formatElapsed(savedSeconds * 1000)} to timesheet`);
        } else {
          toast.success("Timer stopped");
        }
      }
      ok = true;
    } catch (err) {
      if (canQueueOffline() && isNetworkError(err)) {
        await stopOffline();
        return;
      }
      toast.error(getErrorMessage(err, "Failed to stop timer"));
      try {
        const current = await timerApi.current();
        useTimerStore.getState().hydrateFromApi(current);
      } catch {
        // keep local state
      }
    }
  });
  return ok;
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
      const store = useTimerStore.getState();
      const currentProject = store.selectedProjectId;
      store.reset();
      store.setProject(currentProject);
      dispatchTimerStopped({ totalDurationSeconds: 0, entryCount: 0 });
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
