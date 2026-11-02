/**
 * Header sync indicator for the offline outbox: synced, waiting, syncing or
 * offline. Click to flush now.
 */
"use client";

import { useEffect, useState } from "react";
import { CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isElectron } from "@/services/electron";
import { pendingTotal, SYNC_NOW_EVENT, useOfflineStore } from "@/store/offline.store";

type SyncState = "synced" | "waiting" | "syncing" | "offline";

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function describe(state: SyncState, count: number, failed: boolean): string {
  const items = `${count} ${count === 1 ? "item" : "items"}`;
  switch (state) {
    case "offline":
      return count > 0
        ? `Offline — ${items} saved on this device`
        : "Offline — new time is saved on this device";
    case "syncing":
      return count > 0 ? `Syncing ${items}…` : "Syncing…";
    case "waiting":
      return failed ? `Server unreachable — ${items} waiting` : `${items} waiting to sync`;
    default:
      return "All changes synced";
  }
}

export function SyncStatus({ className }: { className?: string }) {
  // The outbox only exists in Electron; checking after mount keeps the static
  // export's first render identical on server and client.
  const [available, setAvailable] = useState(false);
  // A click with nothing queued still spins briefly, so it visibly did something.
  const [manualUntil, setManualUntil] = useState(0);
  const online = useOfflineStore((s) => s.online);
  const syncing = useOfflineStore((s) => s.syncing);
  const pending = useOfflineStore((s) => s.pending);
  const failed = useOfflineStore((s) => s.failed);
  const lastSyncedAt = useOfflineStore((s) => s.lastSyncedAt);

  useEffect(() => {
    setAvailable(isElectron());
  }, []);

  useEffect(() => {
    if (!manualUntil) return;
    const id = window.setTimeout(() => setManualUntil(0), Math.max(0, manualUntil - Date.now()));
    return () => window.clearTimeout(id);
  }, [manualUntil]);

  if (!available) return null;

  const count = pendingTotal(pending);
  // Background flushes run every few seconds; only spin for an upload that is
  // going through. While uploads keep failing, retries show as "waiting".
  const state: SyncState = !online
    ? "offline"
    : (syncing && count > 0 && !failed) || manualUntil > 0
      ? "syncing"
      : count > 0
        ? "waiting"
        : "synced";
  const label = describe(state, count, failed);
  const last = formatTime(lastSyncedAt);
  const Icon = state === "offline" ? CloudOff : state === "synced" ? CloudCheck : RefreshCw;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn("relative cursor-pointer bg-transparent", className)}
          aria-label={`${label}. Sync now`}
          disabled={state === "syncing"}
          onClick={() => {
            setManualUntil(Date.now() + 800);
            window.dispatchEvent(new CustomEvent(SYNC_NOW_EVENT));
          }}
        >
          <Icon
            className={cn(
              "size-4",
              state === "synced" && "text-[#00a63e]",
              state === "waiting" && "text-[#d08700]",
              state === "syncing" && "animate-spin text-[#2b7fff]",
              state === "offline" && "text-[#99a1af] dark:text-[#64748b]",
            )}
            strokeWidth={2}
            aria-hidden
          />
          {count > 0 && state !== "syncing" ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#d08700] px-1 text-[9px] font-semibold leading-none text-white">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className="text-xs">
        <p>{label}</p>
        {last ? <p className="opacity-70">Last synced {last}</p> : null}
        {state !== "syncing" ? <p className="opacity-70">Click to sync now</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
