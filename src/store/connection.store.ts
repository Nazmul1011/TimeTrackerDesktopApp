/**
 * Can this app reach the server right now?
 *
 * Every API reply feeds this (see services/api/client.ts): any answer from
 * the server means online, a request that got no answer means offline.
 * While offline, useConnectionMonitor checks /health/live until it answers.
 * Screens read `online` to show the offline banner, fall back to their saved
 * copy, and turn off editing.
 */
import { create } from "zustand";

export type PendingUploads = {
  /** Timer clicks (start / pause / resume / stop) waiting to upload. */
  time: number;
  screenshots: number;
  /** App-usage batches. Not shown to the user as a number. */
  activity: number;
};

type ConnectionState = {
  online: boolean;
  /** Epoch ms of the moment the connection was lost, while offline. */
  offlineSince: number | null;
  /** Epoch ms of the last offline → online change, for the "Back online" message. */
  restoredAt: number | null;
  pending: PendingUploads;
  markOnline: () => void;
  markOffline: () => void;
  setPending: (pending: PendingUploads) => void;
};

const NO_PENDING: PendingUploads = { time: 0, screenshots: 0, activity: 0 };

// Starts online so the first render matches the pre-built (static) page;
// useConnectionMonitor checks navigator.onLine right after mount.
export const useConnectionStore = create<ConnectionState>((set, get) => ({
  online: true,
  offlineSince: null,
  restoredAt: null,
  pending: NO_PENDING,

  markOnline: () => {
    if (get().online) return;
    set({ online: true, offlineSince: null, restoredAt: Date.now() });
  },

  markOffline: () => {
    if (!get().online) return;
    set({ online: false, offlineSince: Date.now(), restoredAt: null });
  },

  setPending: (pending) => {
    const current = get().pending;
    if (
      current.time === pending.time &&
      current.screenshots === pending.screenshots &&
      current.activity === pending.activity
    ) {
      return;
    }
    set({ pending });
  },
}));

export function isAppOnline(): boolean {
  return useConnectionStore.getState().online;
}

export function totalPending(pending: PendingUploads): number {
  return pending.time + pending.screenshots + pending.activity;
}

/** Fired once each time the connection comes back, after queued work was sent. */
export const CONNECTION_RESTORED_EVENT = "gr8r:connection-restored";
