/**
 * Timer Zustand store — local ticking hydrated from backend elapsedSeconds.
 */
import { create } from "zustand";
import type { ApiTimer } from "@/services/api/types";
import type { Timer, TimerStatus } from "@/types";

interface TimerState {
  timer: Timer;
  /** Epoch ms when the current running segment began */
  segmentStartedAt: number | null;
  /** Elapsed ms accumulated before the current running segment */
  baseElapsedMs: number;
  isSyncing: boolean;
  setDescription: (description: string) => void;
  setProject: (projectId: string | null) => void;
  hydrateFromApi: (apiTimer: ApiTimer | null) => void;
  applyElapsedSeconds: (
    elapsedSeconds: number,
    status: TimerStatus,
    partial?: Partial<Timer>,
  ) => void;
  setIdle: (elapsedMs?: number) => void;
  setSyncing: (isSyncing: boolean) => void;
  tick: () => void;
  reset: () => void;
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
  isSyncing: false,

  setDescription: (description) =>
    set((s) => ({ timer: { ...s.timer, description } })),

  setProject: (projectId) =>
    set((s) => ({ timer: { ...s.timer, projectId } })),

  hydrateFromApi: (apiTimer) => {
    if (!apiTimer) {
      set({
        timer: initialTimer,
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

  setIdle: (elapsedMs = 0) => {
    set({
      segmentStartedAt: null,
      baseElapsedMs: elapsedMs,
      timer: {
        ...initialTimer,
        elapsedMs,
      },
    });
  },

  setSyncing: (isSyncing) => set({ isSyncing }),

  tick: () => {
    const { timer, segmentStartedAt, baseElapsedMs } = get();
    if (timer.status !== "running" || !segmentStartedAt) return;
    set({
      timer: {
        ...timer,
        elapsedMs: liveElapsed(baseElapsedMs, segmentStartedAt),
      },
    });
  },

  reset: () =>
    set({
      timer: initialTimer,
      segmentStartedAt: null,
      baseElapsedMs: 0,
      isSyncing: false,
    }),
}));
