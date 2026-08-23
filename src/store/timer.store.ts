/**
 * Timer Zustand store — session ticking + today's logged total.
 * Display = todayLoggedMs + session elapsed (while running/paused).
 * Resets today's total at local midnight.
 */
import { create } from "zustand";
import type { ApiTimer } from "@/services/api/types";
import { toIsoDate } from "@/services/api/timesheet.api";
import type { Timer, TimerStatus } from "@/types";

interface TimerState {
  timer: Timer;
  /** Epoch ms when the current running segment began */
  segmentStartedAt: number | null;
  /** Elapsed ms accumulated before the current running segment */
  baseElapsedMs: number;
  /** Completed time entries for today (ms) — survives stop until day ends */
  todayLoggedMs: number;
  /** Local calendar day for todayLoggedMs */
  todayDate: string;
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
  const status: TimerStatus =
    apiTimer.status === "paused" ? "paused" : "running";
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
  segmentStartedAt: null,
  baseElapsedMs: 0,
  todayLoggedMs: 0,
  todayDate: toIsoDate(),
  isSyncing: false,

  setDescription: (description) =>
    set((s) => ({ timer: { ...s.timer, description } })),

  setProject: (projectId) =>
    set((s) => ({ timer: { ...s.timer, projectId } })),

  hydrateFromApi: (apiTimer) => {
    if (!apiTimer) {
      // Idle — keep today's logged total, clear only the live session
      set({
        timer: { ...initialTimer, elapsedMs: 0 },
        segmentStartedAt: null,
        baseElapsedMs: 0,
      });
      return;
    }
    const mapped = mapApiTimer(apiTimer);
    set(mapped);
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
      todayDate: toIsoDate(),
    });
  },

  ensureToday: () => {
    const today = toIsoDate();
    if (get().todayDate === today) return;
    set({ todayDate: today, todayLoggedMs: 0 });
  },

  setSyncing: (isSyncing) => set({ isSyncing }),

  tick: () => {
    const { timer, segmentStartedAt, baseElapsedMs } = get();
    if (timer.status !== "running" || !segmentStartedAt) return;
    get().ensureToday();
    set({
      timer: {
        ...timer,
        elapsedMs: liveElapsed(baseElapsedMs, segmentStartedAt),
      },
    });
  },

  getDisplayMs: () => {
    const state = get();
    state.ensureToday();
    const sessionMs =
      state.timer.status === "running" || state.timer.status === "paused"
        ? state.timer.elapsedMs
        : 0;
    return state.todayLoggedMs + sessionMs;
  },

  reset: () =>
    set({
      timer: initialTimer,
      segmentStartedAt: null,
      baseElapsedMs: 0,
      todayLoggedMs: 0,
      todayDate: toIsoDate(),
      isSyncing: false,
    }),
}));
