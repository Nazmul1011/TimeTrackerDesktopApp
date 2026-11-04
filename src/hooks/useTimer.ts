/**
 * Timer hook — backend-synced start/stop/pause/resume.
 * Clock shows today's total (saved + live session); resets at day end.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { formatElapsed } from "@/lib/dayjs";
import { TIMER_STOPPED_EVENT, dispatchTimerStopped } from "@/lib/timer-events";
import {
  pauseTimer,
  resetDayTimer,
  resumeTimer,
  selectProject,
  startTimer,
  stopTimer,
} from "@/lib/timer-actions";
import { rememberTimerSession, reopenServerSession } from "@/lib/offline-sync";
import { listOfflineSessions, offlineSecondsOn } from "@/lib/offline-time";
import { todayInUserZone } from "@/lib/org-date";
import { readCachedView, writeCachedView } from "@/lib/view-cache";
import { timerApi } from "@/services/api/timer.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { CONNECTION_RESTORED_EVENT } from "@/store/connection.store";
import { useTimerStore } from "@/store/timer.store";

/** Fallback only: realtime events push timer changes as they happen. */
const TIMER_POLL_MS = 30_000;
/** Saved copy of the server's total for one day (key: that day). */
const TODAY_TOTAL_CACHE = "todayTotal";

export function useTimer(options?: { hydrateOnMount?: boolean }) {
  const hydrateOnMount = options?.hydrateOnMount ?? false;
  const organizationId = useAuthStore((s) => s.organizationId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();

  const timer = useTimerStore((s) => s.timer);
  const selectedProjectId = useTimerStore((s) => s.selectedProjectId);
  const todayLoggedMs = useTimerStore((s) => s.todayLoggedMs);
  const isSyncing = useTimerStore((s) => s.isSyncing);
  const tick = useTimerStore((s) => s.tick);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);
  const applyElapsedSeconds = useTimerStore((s) => s.applyElapsedSeconds);
  const setIdle = useTimerStore((s) => s.setIdle);
  const setTodayLoggedSeconds = useTimerStore((s) => s.setTodayLoggedSeconds);
  const ensureToday = useTimerStore((s) => s.ensureToday);
  const getDisplayMs = useTimerStore((s) => s.getDisplayMs);
  const setProject = useTimerStore((s) => s.setProject);
  const setDescription = useTimerStore((s) => s.setDescription);
  const reset = useTimerStore((s) => s.reset);

  const missingTimerStreakRef = useRef(0);
  // False until today's total has loaded once; the poll below retries while false
  // so a failed load (offline at boot/wake) can't leave the clock at 00:00:00.
  const todayTotalLoadedRef = useRef(false);
  const [, forceRender] = useState(0);

  // True once today's total came from the server or its saved copy, so the
  // saved copy never overwrites a number this run already has.
  const todayTotalShownRef = useRef(false);

  const refreshTodayTotal = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    const requestedOrg = organizationId;
    const day = todayInUserZone();
    try {
      const seconds = await timesheetApi.getTodayLoggedSeconds(orgTimezone);
      // A total for the org we just left must not land on the new one.
      if (useAuthStore.getState().organizationId !== requestedOrg) return;
      writeCachedView(TODAY_TOTAL_CACHE, day, seconds);
      // Sessions stopped offline are not in the server's total yet.
      const offline = offlineSecondsOn(await listOfflineSessions(), day);
      if (useAuthStore.getState().organizationId !== requestedOrg) return;
      setTodayLoggedSeconds(seconds + offline);
      todayTotalLoadedRef.current = true;
      todayTotalShownRef.current = true;
    } catch {
      // Keep the previous total; the poll retries. On an offline start the
      // clock would read 00:00:00, so show the saved total instead.
      todayTotalLoadedRef.current = false;
      if (todayTotalShownRef.current) return;
      const cached = readCachedView<number>(TODAY_TOTAL_CACHE, day);
      if (typeof cached?.data !== "number") return;
      const offline = offlineSecondsOn(await listOfflineSessions(), day);
      if (useAuthStore.getState().organizationId !== requestedOrg || todayTotalShownRef.current) {
        return;
      }
      setTodayLoggedSeconds(cached.data + offline);
      todayTotalShownRef.current = true;
    }
  }, [isAuthenticated, organizationId, orgTimezone, setTodayLoggedSeconds]);

  const refreshCurrent = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    const requestedOrg = organizationId;
    try {
      const current = await timerApi.current();
      if (useAuthStore.getState().organizationId !== requestedOrg) return;
      hydrateFromApi(current);
    } catch {
      // keep local state if sync fails
    }
  }, [hydrateFromApi, isAuthenticated, organizationId]);

  // Timer session and today's total belong to a single org. Clear them on a
  // switch so the refresh below re-hydrates from the new org instead of
  // leaving the previous org's clock running.
  const loadedOrgRef = useRef(organizationId);
  useEffect(() => {
    if (loadedOrgRef.current === organizationId) return;
    loadedOrgRef.current = organizationId;
    todayTotalLoadedRef.current = false;
    todayTotalShownRef.current = false;
    reset();
  }, [organizationId, reset]);

  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    void refreshTodayTotal();
    void refreshCurrent();
  }, [isAuthenticated, organizationId, refreshCurrent, refreshTodayTotal]);

  useEffect(() => {
    if (!hydrateOnMount) return;
    void refreshCurrent();
    void refreshTodayTotal();
  }, [hydrateOnMount, refreshCurrent, refreshTodayTotal]);

  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    missingTimerStreakRef.current = 0;
    const requestedOrg = organizationId;
    const id = window.setInterval(async () => {
      if (!todayTotalLoadedRef.current) void refreshTodayTotal();
      try {
        const current = await timerApi.current();
        if (useAuthStore.getState().organizationId !== requestedOrg) return;
        const status = useTimerStore.getState().timer.status;
        if (!current) {
          if (status === "idle") {
            missingTimerStreakRef.current = 0;
            return;
          }
          // A single empty /timer/current (auth blip, race after start)
          // used to call setIdle() and kill screenshot capture. Confirm twice.
          missingTimerStreakRef.current += 1;
          if (missingTimerStreakRef.current >= 2) {
            if (isElectron()) {
              // The watchdog may have closed the timer while this laptop kept
              // tracking. Reopen it from the local session instead of zeroing the clock.
              await reopenServerSession();
            } else {
              setIdle();
              dispatchTimerStopped();
            }
          }
          return;
        }
        missingTimerStreakRef.current = 0;
        if (status === "idle") {
          hydrateFromApi(current);
        }
      } catch {
        // Network/401 must not stop a locally running timer (screenshots depend on it)
      }
    }, TIMER_POLL_MS);
    return () => window.clearInterval(id);
  }, [hydrateFromApi, isAuthenticated, organizationId, refreshTodayTotal, setIdle]);

  // Start / resume (button, tray, idle auto-resume, server hydrate)
  useEffect(() => {
    if (timer.status !== "running") return;
    void refreshTodayTotal();
  }, [timer.status, refreshTodayTotal]);

  // Window shown again (from tray, after sleep)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshTodayTotal();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshTodayTotal]);

  // Refresh today's total after any stop (local or remote)
  useEffect(() => {
    const onStopped = () => {
      void refreshTodayTotal();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, onStopped);
    window.addEventListener(CONNECTION_RESTORED_EVENT, onStopped);
    return () => {
      window.removeEventListener(TIMER_STOPPED_EVENT, onStopped);
      window.removeEventListener(CONNECTION_RESTORED_EVENT, onStopped);
    };
  }, [refreshTodayTotal]);

  // Tick the clock while running; also re-check day boundary every minute
  useEffect(() => {
    if (timer.status !== "running") {
      const dayCheck = window.setInterval(() => {
        ensureToday();
        forceRender((n) => n + 1);
      }, 60_000);
      return () => window.clearInterval(dayCheck);
    }
    const id = window.setInterval(() => {
      tick();
      forceRender((n) => n + 1);
    }, 1000);
    const touch = window.setInterval(() => {
      void rememberTimerSession("running");
    }, 60_000);
    return () => {
      window.clearInterval(id);
      window.clearInterval(touch);
    };
  }, [timer.status, tick, ensureToday]);

  // Re-render when todayLoggedMs changes while idle
  useEffect(() => {
    forceRender((n) => n + 1);
  }, [todayLoggedMs, timer.elapsedMs, timer.status]);

  const start = useCallback((projectId?: string | null) => {
    startTimer(projectId);
  }, []);

  const pause = useCallback(async () => {
    await pauseTimer();
  }, []);

  const resume = useCallback(async () => {
    await resumeTimer();
  }, []);

  const stop = useCallback(async () => {
    await stopTimer();
  }, []);

  const resetDay = useCallback(async () => {
    return await resetDayTimer();
  }, []);

  const displayMs = getDisplayMs();

  return {
    timer,
    selectedProjectId,
    display: formatElapsed(displayMs),
    displayMs,
    todayLoggedMs,
    isRunning: timer.status === "running",
    isPaused: timer.status === "paused",
    isIdle: timer.status === "idle",
    isSyncing,
    start,
    stop,
    pause,
    resume,
    resetDay,
    selectProject,
    setProject,
    setDescription,
    reset,
    refreshCurrent,
    refreshTodayTotal,
    applyElapsedSeconds,
    hydrateFromApi,
  };
}
