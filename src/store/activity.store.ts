/**
 * Activity Zustand store — scaffolding only.
 */
import { create } from "zustand";
import type { Activity } from "@/types";

interface ActivityState {
  activities: Activity[];
  activeMs: number;
  idleMs: number;
  setSummary: (activeMs: number, idleMs: number) => void;
  setActivities: (activities: Activity[]) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: [],
  activeMs: 0,
  idleMs: 0,
  setSummary: (activeMs, idleMs) => set({ activeMs, idleMs }),
  setActivities: (activities) => set({ activities }),
  reset: () => set({ activities: [], activeMs: 0, idleMs: 0 }),
}));
