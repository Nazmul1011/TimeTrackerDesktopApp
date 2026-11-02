"use client";

import { useOfflineStore } from "@/store/offline.store";

export function OfflineBanner() {
  const online = useOfflineStore((s) => s.online);

  // Queued and syncing states are shown by the header sync icon.
  if (online) return null;
  const label = "You're offline. Time, activity, and screenshots are saved on this device.";

  return (
    <div className="rounded-lg border border-[#f0d78c] bg-[#fff8e6] px-3 py-2 text-xs text-[#7a5b00] dark:border-[#78590f] dark:bg-[#2b2410] dark:text-[#f0d78c]">
      {label}
    </div>
  );
}
