/**
 * Timer hook — backend-synced start/stop/pause/resume.
 * Clock shows today's total (saved + live session); resets at day end.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { formatElapsed } from "@/lib/dayjs";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import {
  pauseTimer,
  resetDayTimer,
  resumeTimer,
  runTimerMutation,
  selectProject,
  stopTimer,
} from "@/lib/timer-actions";
import { timerApi } from "@/services/api/timer.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { sanitizeProjectId } from "@/lib/project";
import { cancelWindowReveal } from "@/lib/window-reveal";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

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
  const [, forceRender] = useState(0);

  const refreshTodayTotal = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    const requestedOrg = organizationId;
    try {
      const seconds = await timesheetApi.getTodayLoggedSeconds(orgTimezone);
      // A total for the org we just left must not land on the new one.
      if (useAuthStore.getState().organizationId !== requestedOrg) return;
      setTodayLoggedSeconds(seconds);
    } catch {
      // keep previous total
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
            setIdle();
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
    }, 4000);
    return () => window.clearInterval(id);
  }, [hydrateFromApi, isAuthenticated, organizationId, setIdle]);

  // Refresh today's total after any stop (local or remote)
  useEffect(() => {
    const onStopped = () => {
      void refreshTodayTotal();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, onStopped);
    return () => window.removeEventListener(TIMER_STOPPED_EVENT, onStopped);
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
    return () => window.clearInterval(id);
  }, [timer.status, tick, ensureToday]);

  // Re-render when todayLoggedMs changes while idle
  useEffect(() => {
    forceRender((n) => n + 1);
  }, [todayLoggedMs, timer.elapsedMs, timer.status]);

  const start = useCallback(
    async (projectId?: string | null) => {
      await runTimerMutation(async () => {
        try {
          ensureToday();
          // Default to whatever the picker shows, not the last session's project.
          const resolved = projectId !== undefined ? projectId : selectedProjectId;
          // Keep picker in sync (e.g. timesheet Play / General)
          setProject(resolved ?? null);
          const apiTimer = await timerApi.start({
            projectId: sanitizeProjectId(resolved),
            description: timer.description || undefined,
          });
          hydrateFromApi(apiTimer);
          cancelWindowReveal();
        } catch (err) {
          toast.error(getErrorMessage(err, "Failed to start timer"));
        }
      });
    },
    [ensureToday, hydrateFromApi, selectedProjectId, setProject, timer.description],
  );

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
