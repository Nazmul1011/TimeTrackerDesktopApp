/**
 * Timer hook — backend-synced start/stop/pause/resume.
 * Clock shows today's total (saved + live session); resets at day end.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatElapsed } from "@/lib/dayjs";
import { dispatchTimerStopped, TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { timerApi } from "@/services/api/timer.api";
import { timesheetApi } from "@/services/api/timesheet.api";
import { sanitizeProjectId } from "@/lib/project";
import { isNetworkError, isOfflineNow } from "@/lib/network";
import {
  enqueueTimerEvent,
  persistLocalTimer,
} from "@/services/timer/offline-persist";
import {
  cancelWindowReveal,
  scheduleWindowRevealAfterResume,
} from "@/lib/window-reveal";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useTimer(options?: { hydrateOnMount?: boolean }) {
  const hydrateOnMount = options?.hydrateOnMount ?? false;
  const organizationId = useAuthStore((s) => s.organizationId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const timer = useTimerStore((s) => s.timer);
  const todayLoggedMs = useTimerStore((s) => s.todayLoggedMs);
  const isSyncing = useTimerStore((s) => s.isSyncing);
  const tick = useTimerStore((s) => s.tick);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);
  const applyElapsedSeconds = useTimerStore((s) => s.applyElapsedSeconds);
  const setIdle = useTimerStore((s) => s.setIdle);
  const setTodayLoggedSeconds = useTimerStore((s) => s.setTodayLoggedSeconds);
  const ensureToday = useTimerStore((s) => s.ensureToday);
  const getDisplayMs = useTimerStore((s) => s.getDisplayMs);
  const setSyncing = useTimerStore((s) => s.setSyncing);
  const setProject = useTimerStore((s) => s.setProject);
  const setDescription = useTimerStore((s) => s.setDescription);
  const reset = useTimerStore((s) => s.reset);
  const applyLocalStart = useTimerStore((s) => s.applyLocalStart);
  const applyLocalPause = useTimerStore((s) => s.applyLocalPause);
  const applyLocalResume = useTimerStore((s) => s.applyLocalResume);

  const busyRef = useRef(false);
  const missingTimerStreakRef = useRef(0);
  const [, forceRender] = useState(0);

  const refreshTodayTotal = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    if (useTimerStore.getState().isOfflineSession) return;
    try {
      const seconds = await timesheetApi.getTodayLoggedSeconds();
      if (useTimerStore.getState().isOfflineSession) return;
      setTodayLoggedSeconds(seconds);
    } catch {
      // keep previous total
    }
  }, [isAuthenticated, organizationId, setTodayLoggedSeconds]);

  const refreshCurrent = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    if (useTimerStore.getState().isOfflineSession) return;
    try {
      const current = await timerApi.current();
      if (useTimerStore.getState().isOfflineSession) return;
      hydrateFromApi(current);
    } catch {
      // keep local state if sync fails
    }
  }, [hydrateFromApi, isAuthenticated, organizationId]);

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
    const id = window.setInterval(async () => {
      try {
        const current = await timerApi.current();
        const status = useTimerStore.getState().timer.status;
        if (!current) {
          if (status === "idle") {
            missingTimerStreakRef.current = 0;
            return;
          }
          if (useTimerStore.getState().isOfflineSession) {
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
      if (useTimerStore.getState().isOfflineSession) return;
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
      if (busyRef.current) return;
      busyRef.current = true;
      setSyncing(true);
      try {
        ensureToday();
        const resolved =
          projectId !== undefined ? projectId : timer.projectId;
        setProject(resolved ?? null);
        const occurredAt = new Date().toISOString();
        const goOffline = async () => {
          applyLocalStart({
            projectId: resolved,
            description: timer.description,
            occurredAt,
          });
          await enqueueTimerEvent({
            type: "start",
            occurredAt,
            projectId: sanitizeProjectId(resolved),
            description: timer.description || undefined,
          });
          cancelWindowReveal();
          toast.message(
            "Timer started offline — will sync when you are back online",
          );
        };
        if (isOfflineNow()) {
          await goOffline();
          return;
        }
        try {
          const apiTimer = await timerApi.start({
            projectId: sanitizeProjectId(resolved),
            description: timer.description || undefined,
            occurredAt,
          });
          hydrateFromApi(apiTimer);
          persistLocalTimer();
          cancelWindowReveal();
        } catch (err) {
          if (isNetworkError(err)) {
            await goOffline();
            return;
          }
          toast.error(getErrorMessage(err, "Failed to start timer"));
        }
      } finally {
        setSyncing(false);
        busyRef.current = false;
      }
    },
    [
      applyLocalStart,
      ensureToday,
      hydrateFromApi,
      setProject,
      setSyncing,
      timer.description,
      timer.projectId,
    ],
  );

  const pause = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    const occurredAt = new Date().toISOString();
    try {
      if (isOfflineNow()) {
        applyLocalPause();
        await enqueueTimerEvent({ type: "pause", occurredAt });
        cancelWindowReveal();
        toast.message("Paused offline — will sync when you are back online");
        return;
      }
      const apiTimer = await timerApi.pause({ occurredAt });
      hydrateFromApi(apiTimer);
      persistLocalTimer();
      cancelWindowReveal();
    } catch (err) {
      if (isNetworkError(err)) {
        applyLocalPause();
        await enqueueTimerEvent({ type: "pause", occurredAt });
        cancelWindowReveal();
        toast.message("Paused offline — will sync when you are back online");
        return;
      }
      toast.error(getErrorMessage(err, "Failed to pause timer"));
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [applyLocalPause, hydrateFromApi, setSyncing]);

  const resume = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    const occurredAt = new Date().toISOString();
    try {
      if (isOfflineNow()) {
        applyLocalResume();
        await enqueueTimerEvent({ type: "resume", occurredAt });
        scheduleWindowRevealAfterResume();
        toast.message("Resumed offline — will sync when you are back online");
        return;
      }
      const apiTimer = await timerApi.resume({ occurredAt });
      hydrateFromApi(apiTimer);
      persistLocalTimer();
      scheduleWindowRevealAfterResume();
    } catch (err) {
      if (isNetworkError(err)) {
        applyLocalResume();
        await enqueueTimerEvent({ type: "resume", occurredAt });
        scheduleWindowRevealAfterResume();
        toast.message("Resumed offline — will sync when you are back online");
        return;
      }
      toast.error(getErrorMessage(err, "Failed to resume timer"));
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [applyLocalResume, hydrateFromApi, setSyncing]);

  const stop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    const occurredAt = new Date().toISOString();
    const finishLocalStop = async () => {
      const sessionSeconds = Math.max(
        0,
        Math.round(
          (getDisplayMs() - useTimerStore.getState().todayLoggedMs) / 1000,
        ),
      );
      await enqueueTimerEvent({
        type: "stop",
        occurredAt,
        description: timer.description || undefined,
      });
      const previousLogged = useTimerStore.getState().todayLoggedMs;
      setIdle();
      useTimerStore.getState().setOfflineSession(true);
      if (sessionSeconds > 0) {
        setTodayLoggedSeconds(previousLogged / 1000 + sessionSeconds);
      }
      persistLocalTimer();
      cancelWindowReveal();
      if (sessionSeconds > 0) {
        dispatchTimerStopped({
          totalDurationSeconds: sessionSeconds,
          entryCount: 1,
        });
        toast.success(
          `Saved ${formatElapsed(sessionSeconds * 1000)} locally — will sync online`,
        );
      } else {
        toast.success("Timer stopped offline — will sync when you are back online");
      }
    };
    try {
      if (isOfflineNow()) {
        await finishLocalStop();
        return;
      }
      const sessionSeconds = Math.max(
        0,
        Math.round((getDisplayMs() - useTimerStore.getState().todayLoggedMs) / 1000),
      );
      const result = await timerApi.stop({
        description: timer.description || undefined,
        occurredAt,
      });
      const rows = result?.entries ?? [];
      const fromEntries = rows.reduce(
        (sum, entry) => sum + (entry.duration ?? 0),
        0,
      );
      const savedSeconds =
        result?.totalDurationSeconds || fromEntries || sessionSeconds;
      const previousLogged = useTimerStore.getState().todayLoggedMs;
      setIdle();
      persistLocalTimer();
      cancelWindowReveal();
      if (savedSeconds > 0) {
        setTodayLoggedSeconds(previousLogged / 1000 + savedSeconds);
      }
      dispatchTimerStopped({
        totalDurationSeconds: savedSeconds,
        entryCount: result?.count ?? rows.length,
      });
      await refreshTodayTotal();
      if (savedSeconds > 0) {
        toast.success(`Saved ${formatElapsed(savedSeconds * 1000)} to timesheet`);
      } else {
        toast.success("Timer stopped");
      }
    } catch (err) {
      if (isNetworkError(err)) {
        await finishLocalStop();
        return;
      }
      toast.error(getErrorMessage(err, "Failed to stop timer"));
      await refreshCurrent();
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [
    getDisplayMs,
    refreshCurrent,
    refreshTodayTotal,
    setIdle,
    setSyncing,
    setTodayLoggedSeconds,
    timer.description,
  ]);

  const displayMs = getDisplayMs();

  return {
    timer,
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
    setProject,
    setDescription,
    reset,
    refreshCurrent,
    refreshTodayTotal,
    applyElapsedSeconds,
    hydrateFromApi,
  };
}
