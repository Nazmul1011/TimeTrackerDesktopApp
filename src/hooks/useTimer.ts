/**
 * Timer hook — backend-synced start/stop/pause/resume with local ticking.
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { formatElapsed } from "@/lib/dayjs";
import { timerApi } from "@/services/api/timer.api";
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
  const isSyncing = useTimerStore((s) => s.isSyncing);
  const tick = useTimerStore((s) => s.tick);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);
  const applyElapsedSeconds = useTimerStore((s) => s.applyElapsedSeconds);
  const setIdle = useTimerStore((s) => s.setIdle);
  const setSyncing = useTimerStore((s) => s.setSyncing);
  const setProject = useTimerStore((s) => s.setProject);
  const setDescription = useTimerStore((s) => s.setDescription);
  const reset = useTimerStore((s) => s.reset);

  const busyRef = useRef(false);

  const refreshCurrent = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    try {
      const current = await timerApi.current();
      hydrateFromApi(current);
    } catch {
      // keep local state if sync fails
    }
  }, [hydrateFromApi, isAuthenticated, organizationId]);

  useEffect(() => {
    if (!hydrateOnMount) return;
    void refreshCurrent();
  }, [hydrateOnMount, refreshCurrent]);

  useEffect(() => {
    if (timer.status !== "running") return;
    const id = window.setInterval(() => tick(), 1000);
    return () => window.clearInterval(id);
  }, [timer.status, tick]);

  const start = useCallback(
    async (projectId?: string | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setSyncing(true);
      try {
        const resolvedProjectId = projectId ?? timer.projectId ?? undefined;
        const apiTimer = await timerApi.start({
          // Backend requires UUID when projectId is set
          projectId: resolvedProjectId || undefined,
          description: timer.description || undefined,
        });
        hydrateFromApi(apiTimer);
      } catch (err) {
        toast.error(getErrorMessage(err, "Failed to start timer"));
      } finally {
        setSyncing(false);
        busyRef.current = false;
      }
    },
    [hydrateFromApi, setSyncing, timer.description, timer.projectId],
  );

  const pause = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    try {
      const apiTimer = await timerApi.pause();
      hydrateFromApi(apiTimer);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to pause timer"));
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [hydrateFromApi, setSyncing]);

  const resume = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    try {
      const apiTimer = await timerApi.resume();
      hydrateFromApi(apiTimer);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to resume timer"));
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [hydrateFromApi, setSyncing]);

  const stop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSyncing(true);
    try {
      await timerApi.stop({
        description: timer.description || undefined,
      });
      setIdle(0);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to stop timer"));
    } finally {
      setSyncing(false);
      busyRef.current = false;
    }
  }, [setIdle, setSyncing, timer.description]);

  return {
    timer,
    display: formatElapsed(timer.elapsedMs),
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
    applyElapsedSeconds,
    hydrateFromApi,
  };
}
