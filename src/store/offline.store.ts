/**
 * Offline sync banner state.
 */
import { create } from "zustand";

type PendingCounts = {
  timer: number;
  activity: number;
  screenshots: number;
};

interface OfflineState {
  online: boolean;
  syncing: boolean;
  pending: PendingCounts;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setPending: (pending: PendingCounts) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  syncing: false,
  pending: { timer: 0, activity: 0, screenshots: 0 },
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setPending: (pending) => set({ pending }),
}));

export function hasOfflineQueue(pending: PendingCounts): boolean {
  return pending.timer + pending.activity + pending.screenshots > 0;
}
