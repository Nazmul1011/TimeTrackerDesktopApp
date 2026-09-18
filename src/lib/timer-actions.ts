/**
 * Timer pause / resume / stop used by the window UI and the menu-bar tray.
 */
import { toast } from "sonner";
import { formatElapsed } from "@/lib/dayjs";
import { sanitizeProjectId } from "@/lib/project";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { cancelWindowReveal, scheduleWindowRevealAfterResume } from "@/lib/window-reveal";
import { getElectronAPI, isElectron } from "@/services/electron";
import { timerApi } from "@/services/api/timer.api";
import { timesheetApi } from "@/services/api/timesheet.api";
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
    try {
      const apiTimer = await timerApi.pause();
      useTimerStore.getState().hydrateFromApi(apiTimer);
      cancelWindowReveal();
      if (isElectron()) {
        void getElectronAPI()?.notification?.show?.({
          title: "Timer paused",
          body: "Timer paused. Resume when you are back.",
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to pause timer"));
    }
  });
}

export async function resumeTimer(): Promise<void> {
  if (useTimerStore.getState().timer.status !== "paused") return;
  await runTimerMutation(async () => {
    try {
      const apiTimer = await timerApi.resume();
      useTimerStore.getState().hydrateFromApi(apiTimer);
      scheduleWindowRevealAfterResume();
    } catch (err) {
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
    try {
      const sessionSeconds = Math.max(0, Math.round(store.timer.elapsedMs / 1000));
      const result = await timerApi.stop({
        description: store.timer.description || undefined,
      });
      const rows = result?.entries ?? [];
      const fromEntries = rows.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
      const savedSeconds = result?.totalDurationSeconds || fromEntries || sessionSeconds;
      const previousLogged = useTimerStore.getState().todayLoggedMs;
      useTimerStore.getState().setIdle();
      cancelWindowReveal();
      if (!options?.skipTodaySync) {
        if (savedSeconds > 0) {
          useTimerStore.getState().setTodayLoggedSeconds(previousLogged / 1000 + savedSeconds);
        }
        dispatchTimerStopped({
          totalDurationSeconds: savedSeconds,
          entryCount: result?.count ?? rows.length,
        });
        try {
          const seconds = await timesheetApi.getTodayLoggedSeconds();
          useTimerStore.getState().setTodayLoggedSeconds(seconds);
        } catch {
          // keep optimistic total
        }
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
