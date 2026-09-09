/**
 * Restore offline timer, flush the outbox when the network returns, and
 * keep a pending-count snapshot for the banner.
 */
"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getElectronAPI, isElectron } from "@/services/electron";
import { timerApi } from "@/services/api/timer.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";
import { persistLocalTimer } from "@/services/timer/offline-persist";
import { useOfflineStore } from "@/store/offline.store";
import { dispatchTimerStopped } from "@/lib/timer-events";

export function useOfflineSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const restoreOfflineSnapshot = useTimerStore((s) => s.restoreOfflineSnapshot);
  const setOfflineSession = useTimerStore((s) => s.setOfflineSession);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);
  const setTodayLoggedSeconds = useTimerStore((s) => s.setTodayLoggedSeconds);

  useEffect(() => {
    if (!isAuthenticated || !isElectron()) return;
    const api = getElectronAPI();
    if (!api?.sync) return;

    let cancelled = false;
    let previousTimerPending = -1;

    const applyStatus = (status: {
      pending?: { timer: number; activity: number; screenshots: number };
      status?: string;
      lastSyncedAt?: string | null;
    }) => {
      const pending = status.pending ?? { timer: 0, activity: 0, screenshots: 0 };
      useOfflineStore.getState().setPending(pending);
      useOfflineStore.getState().setSyncing(status.status === "syncing");
      useOfflineStore
        .getState()
        .setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    };

    const restore = async () => {
      const snapshot = await api.sync.getLocalTimer();
      if (cancelled) return;
      if (snapshot) {
        restoreOfflineSnapshot(snapshot);
      }
      const counts = await api.sync.pendingCounts();
      if (cancelled) return;
      previousTimerPending = counts.timer;
      applyStatus({ pending: counts });
      if (counts.timer > 0) {
        setOfflineSession(true);
      }
    };

    const flush = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      persistLocalTimer();
      const result = await api.sync.run();
      if (cancelled) return;
      if (result.status) applyStatus(result.status);
      const pending = result.status?.pending;
      if (!pending) return;

      const justSyncedTimer =
        pending.timer === 0 &&
        (previousTimerPending > 0 ||
          useTimerStore.getState().isOfflineSession);
      previousTimerPending = pending.timer;
      if (!justSyncedTimer) return;

      const localStatus = useTimerStore.getState().timer.status;
      try {
        const current = await timerApi.current();
        if (current) {
          setOfflineSession(false);
          hydrateFromApi(current);
        } else if (localStatus === "idle") {
          setOfflineSession(false);
          hydrateFromApi(null);
        }
        if (localStatus === "idle") {
          const seconds = await timesheetApi.getTodayLoggedSeconds();
          setTodayLoggedSeconds(seconds);
          dispatchTimerStopped({
            totalDurationSeconds: seconds,
            entryCount: 0,
          });
        }
      } catch {
        // keep local
      }
      persistLocalTimer();
    };

    void restore().then(() => {
      if (!cancelled) void flush();
    });

    const unsub = api.sync.onStatus?.((payload) => {
      applyStatus(payload);
    });

    const onOnline = () => {
      useOfflineStore.getState().setOnline(true);
      toast.message("Back online — syncing saved time…");
      void flush();
    };
    const onOffline = () => {
      useOfflineStore.getState().setOnline(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const interval = window.setInterval(() => {
      persistLocalTimer();
      void flush();
    }, 25_000);

    const persistId = window.setInterval(() => {
      persistLocalTimer();
    }, 15_000);

    return () => {
      cancelled = true;
      unsub?.();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
      window.clearInterval(persistId);
    };
  }, [
    hydrateFromApi,
    isAuthenticated,
    organizationId,
    restoreOfflineSnapshot,
    setOfflineSession,
    setTodayLoggedSeconds,
  ]);
}
