/**
 * Offline sync banner state.
 */
import { create } from "zustand";

type PendingCounts = {
  timer: number;
  activity: number;
  screenshots: number;
};

/** Ask useOfflineSync to flush the outbox now (header sync button). */
export const SYNC_NOW_EVENT = "gr8r:sync-now";

interface OfflineState {
  online: boolean;
  syncing: boolean;
  pending: PendingCounts;
  /** Last flush hit an error (server down, refused); the outbox keeps it. */
  failed: boolean;
  lastSyncedAt: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setPending: (pending: PendingCounts) => void;
  setResult: (result: { failed: boolean; lastSyncedAt: string | null }) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  // Same value on server and client so the static export hydrates cleanly;
  // useOfflineSync sets the real state on mount.
  online: true,
  syncing: false,
  pending: { timer: 0, activity: 0, screenshots: 0 },
  failed: false,
  lastSyncedAt: null,
  setOnline: (online) => set({ online }),
  setSyncing: (syncing) => set({ syncing }),
  setPending: (pending) => set({ pending }),
  setResult: (result) => set(result),
}));

export function pendingTotal(pending: PendingCounts): number {
  return pending.timer + pending.activity + pending.screenshots;
}
