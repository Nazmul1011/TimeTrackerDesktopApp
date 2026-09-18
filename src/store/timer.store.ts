/**
 * Timer Zustand store — session ticking + today's logged total.
 * Display = todayLoggedMs + session elapsed (while running/paused).
 * Resets today's total at midnight in the active org's timezone.
 */
import { create } from "zustand";
import type { ApiTimer } from "@/services/api/types";
import { getOrgTimezone, getUserTimezone, todayInUserZone, todayInZone } from "@/lib/org-date";
import { timerApi } from "@/services/api/timer.api";
import { sanitizeProjectId } from "@/lib/project";
import { dispatchTimerStopped } from "@/lib/timer-events";
import type { Timer, TimerStatus } from "@/types";

interface TimerState {
  timer: Timer;
  /**
   * Project chosen in the picker. Distinct from `timer.projectId`, which is the
   * project the live session is being logged against: the selection survives a
   * stop, and changing it never re-attributes a running session.
   */
  selectedProjectId: string | null;
  /** Epoch ms when the current running segment began */
  segmentStartedAt: number | null;
  /** Elapsed ms accumulated before the current running segment */
  baseElapsedMs: number;
  /** Completed time entries for today (ms) — survives stop until day ends */
  todayLoggedMs: number;
  /** Org-timezone calendar day for todayLoggedMs */
  todayDate: string;
  /**
   * After a manual restart, the home clock is the live session only (00:00:00)
   * until midnight. Timesheet entries are unchanged.
   */
  sessionClockOnly: boolean;
  isSyncing: boolean;
  setDescription: (description: string) => void;
  setProject: (projectId: string | null) => void;
  hydrateFromApi: (apiTimer: ApiTimer | null) => void;
  applyElapsedSeconds: (
    elapsedSeconds: number,
    status: TimerStatus,
    partial?: Partial<Timer>,
  ) => void;
  setIdle: () => void;
  setTodayLoggedSeconds: (seconds: number) => void;
  beginSessionClock: () => void;
  ensureToday: () => void;
  setSyncing: (isSyncing: boolean) => void;
  tick: () => void;
  reset: () => void;
  /** Session + today total for the big clock */
  getDisplayMs: () => number;
}

const initialTimer: Timer = {
  id: null,
  status: "idle",
  projectId: null,
  taskId: null,
  description: "",
  startedAt: null,
  elapsedMs: 0,
};

function liveElapsed(base: number, segmentStartedAt: number | null): number {
  if (!segmentStartedAt) return base;
  return base + (Date.now() - segmentStartedAt);
}

function mapApiTimer(apiTimer: ApiTimer): {
  timer: Timer;
  baseElapsedMs: number;
  segmentStartedAt: number | null;
} {
  const elapsedMs = Math.max(0, (apiTimer.elapsedSeconds ?? 0) * 1000);
  const status: TimerStatus = apiTimer.status === "paused" ? "paused" : "running";
  return {
    timer: {
      id: apiTimer.id,
      status,
      projectId: apiTimer.projectId ?? null,
      taskId: null,
      description: apiTimer.description ?? "",
      startedAt: apiTimer.startTime ?? null,
      elapsedMs,
    },
    baseElapsedMs: elapsedMs,
    segmentStartedAt: status === "running" ? Date.now() : null,
  };
}

export const useTimerStore = create<TimerState>((set, get) => ({
  timer: initialTimer,
  selectedProjectId: null,
  segmentStartedAt: null,
  baseElapsedMs: 0,
  todayLoggedMs: 0,
  todayDate: todayInUserZone(),
  sessionClockOnly: false,
  isSyncing: false,

  setDescription: (description) => set((s) => ({ timer: { ...s.timer, description } })),

  setProject: (projectId) => {
    const next =
      projectId == null || projectId === "" ? null : (sanitizeProjectId(projectId) ?? null);
    // Picker only. The running session keeps its own project, so switching
    // here cannot move elapsed time onto a different project.
    set({ selectedProjectId: next });
  },

  hydrateFromApi: (apiTimer) => {
    if (!apiTimer) {
      // Idle — keep today's logged total and the picker selection, and clear
      // only the live session.
      set({
        timer: { ...initialTimer, elapsedMs: 0 },
        segmentStartedAt: null,
        baseElapsedMs: 0,
      });
      return;
    }
    const mapped = mapApiTimer(apiTimer);
    // A timer running on the server wins the picker, so the UI shows what is
    // actually being logged (app start, another device, remote sync).
    set({ ...mapped, selectedProjectId: mapped.timer.projectId });
  },

  applyElapsedSeconds: (elapsedSeconds, status, partial) => {
    const elapsedMs = Math.max(0, elapsedSeconds * 1000);
    const { timer } = get();
    set({
      baseElapsedMs: elapsedMs,
      segmentStartedAt: status === "running" ? Date.now() : null,
      timer: {
        ...timer,
        ...partial,
        status,
        elapsedMs,
      },
    });
  },

  setIdle: () => {
    set({
      segmentStartedAt: null,
      baseElapsedMs: 0,
      timer: {
        ...initialTimer,
        elapsedMs: 0,
      },
    });
  },

  setTodayLoggedSeconds: (seconds) => {
    get().ensureToday();
    set({
      todayLoggedMs: Math.max(0, seconds) * 1000,
      todayDate: todayInUserZone(),
    });
  },

  beginSessionClock: () => {
    const today = todayInUserZone();
    set({
      sessionClockOnly: true,
      todayLoggedMs: 0,
      todayDate: today,
      segmentStartedAt: null,
      baseElapsedMs: 0,
      timer: {
        ...initialTimer,
        elapsedMs: 0,
      },
    });
  },

  ensureToday: () => {
    const today = todayInUserZone();
    if (get().todayDate === today) return;
    const { timer } = get();
    if (timer.status === "running") {
      set({
        todayDate: today,
        todayLoggedMs: 0,
        sessionClockOnly: false,
        baseElapsedMs: 0,
        segmentStartedAt: Date.now(),
        timer: {
          ...timer,
          elapsedMs: 0,
        },
      });
      void timerApi
        .midnightSplit(undefined, getUserTimezone())
        .then((res) => {
          if (res?.runningTimer) {
            get().hydrateFromApi(res.runningTimer);
          }
        })
        .catch(() => {});
      dispatchTimerStopped();
    } else if (timer.status === "paused") {
      set({
        todayDate: today,
        todayLoggedMs: 0,
        sessionClockOnly: false,
        baseElapsedMs: 0,
        segmentStartedAt: null,
        timer: {
          ...timer,
          elapsedMs: 0,
        },
      });
      void timerApi
        .midnightSplit(undefined, getUserTimezone())
        .then((res) => {
          if (res?.runningTimer) {
            get().hydrateFromApi(res.runningTimer);
          }
        })
        .catch(() => {});
      dispatchTimerStopped();
    } else {
      set({ todayDate: today, todayLoggedMs: 0, sessionClockOnly: false });
      dispatchTimerStopped();
    }
  },

  setSyncing: (isSyncing) => set({ isSyncing }),

  tick: () => {
    get().ensureToday();
    const { timer, segmentStartedAt, baseElapsedMs } = get();
    if (timer.status !== "running" || !segmentStartedAt) return;
    set({
      timer: {
        ...timer,
        elapsedMs: liveElapsed(baseElapsedMs, segmentStartedAt),
      },
    });
  },

  getDisplayMs: () => {
    const state = get();
    const sessionMs =
      state.timer.status === "running" || state.timer.status === "paused"
        ? state.timer.elapsedMs
        : 0;
    // Restart makes the home clock a stopwatch from 00:00:00 until midnight.
    if (state.sessionClockOnly) return sessionMs;
    // Must stay pure: this is read during render. The day rollover is applied
    // by ensureToday() from the ticking effects, so a total carried over from
    // a previous day is ignored here instead of being written away mid-render.
    const dayTotal = state.todayDate === todayInUserZone() ? state.todayLoggedMs : 0;
    return dayTotal + sessionMs;
  },

  reset: () =>
    set({
      timer: initialTimer,
      // Projects are org-scoped, so a reset (org switch) clears the selection.
      selectedProjectId: null,
      segmentStartedAt: null,
      baseElapsedMs: 0,
      todayLoggedMs: 0,
      todayDate: todayInUserZone(),
      sessionClockOnly: false,
      isSyncing: false,
    }),
}));
