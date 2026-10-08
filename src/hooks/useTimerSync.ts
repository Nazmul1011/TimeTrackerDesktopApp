/**
 * Sync timer elapsed time with backend after reconnect / focus.
 */
"use client";

import { useCallback, useEffect } from "react";
import { dispatchTimerStopped } from "@/lib/timer-events";
import { timerApi } from "@/services/api/timer.api";
import type { ApiTimer } from "@/services/api/types";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export function useTimerSync(options?: { onFocus?: boolean; intervalMs?: number }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);

  const sync = useCallback(async () => {
    if (!isAuthenticated || !organizationId) return;
    const apply = (apiTimer: ApiTimer | null) => {
      const wasActive = useTimerStore.getState().timer.status !== "idle";
      hydrateFromApi(apiTimer);
      // Session ended on the server while we were away (sleep/offline): it is
      // now a saved entry, so reload today's total.
      if (!apiTimer && wasActive) dispatchTimerStopped();
    };
    try {
      apply(await timerApi.sync());
    } catch {
      try {
        apply(await timerApi.current());
      } catch {
        // keep local state
      }
    }
  }, [hydrateFromApi, isAuthenticated, organizationId]);

  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    void sync();
  }, [isAuthenticated, organizationId, sync]);

  useEffect(() => {
    if (!options?.onFocus || !isAuthenticated) return;
    const onFocus = () => {
      void sync();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void sync();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated, options?.onFocus, sync]);

  useEffect(() => {
    const ms = options?.intervalMs;
    if (!ms || !isAuthenticated || !organizationId) return;
    const id = window.setInterval(() => {
      void sync();
    }, ms);
    return () => window.clearInterval(id);
  }, [isAuthenticated, organizationId, options?.intervalMs, sync]);

  return { sync };
}
