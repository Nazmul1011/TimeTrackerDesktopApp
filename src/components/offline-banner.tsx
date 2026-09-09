"use client";

import { hasOfflineQueue, useOfflineStore } from "@/store/offline.store";
import { useTimerStore } from "@/store/timer.store";

export function OfflineBanner() {
  const online = useOfflineStore((s) => s.online);
  const syncing = useOfflineStore((s) => s.syncing);
  const pending = useOfflineStore((s) => s.pending);
  const isOfflineSession = useTimerStore((s) => s.isOfflineSession);
  const queued = hasOfflineQueue(pending);

  if (online && !queued && !isOfflineSession && !syncing) return null;

  const label = !online
    ? "You're offline. Time, activity, and screenshots are saved on this device."
    : syncing
      ? "Syncing saved time with the server…"
      : queued || isOfflineSession
        ? "Saved offline work will sync automatically."
        : null;

  if (!label) return null;

  return (
    <div className="rounded-lg border border-[#f0d78c] bg-[#fff8e6] px-3 py-2 text-xs text-[#7a5b00]">
      {label}
    </div>
  );
}
