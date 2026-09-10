/**
 * Top Apps — live usage from /activity/apps for today only (resets at midnight).
 * Icons: OS icons via Electron gr8r-icon:// protocol; letter avatar fallback.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { todayInZone } from "@/lib/org-date";
import { ACTIVITY_FLUSHED_EVENT } from "@/hooks/useTrackingAgent";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { activityApi } from "@/services/api/activity.api";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export type TopAppChip = {
  id: string;
  name: string;
  percent: number;
  /** Real OS icon URL (gr8r-icon://...) when available */
  icon: string | null;
  totalDuration: number;
};

async function resolveIcons(appNames: string[]): Promise<Record<string, string | null>> {
  if (!isElectron()) return {};
  const api = getElectronAPI();
  if (!api?.activity?.getAppIcons) return {};
  try {
    return (await api.activity.getAppIcons(appNames)) ?? {};
  } catch {
    return {};
  }
}

export function useTopApps() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();
  const todayDate = useTimerStore((s) => s.todayDate);
  const [apps, setApps] = useState<TopAppChip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!isAuthenticated || !organizationId) {
        setApps([]);
        setIsLoading(false);
        return;
      }

      // A reply for the org we just left must never overwrite the current one.
      const requestedOrg = organizationId;
      const isStale = () => useAuthStore.getState().organizationId !== requestedOrg;

      if (!opts?.silent) setIsLoading(true);
      setError(null);

      // Today only — same calendar day as the main timer (org timezone).
      const today = todayInZone(orgTimezone);

      try {
        const rows = await activityApi.getApps({
          startDate: today,
          endDate: today,
          excludeIdle: true,
        });

        if (isStale()) return;

        const osIcons = await resolveIcons(rows.map((r) => r.appName));

        const top = rows.map((row) => ({
          id: row.appName,
          name: row.appName,
          percent: row.percent ?? 0,
          icon: osIcons[row.appName] || null,
          totalDuration: row.totalDuration,
        }));

        if (isStale()) return;
        setApps(top);
      } catch (err) {
        if (isStale()) return;
        const message =
          typeof err === "object" &&
          err !== null &&
          "response" in err &&
          (err as { response?: { data?: { message?: string } } }).response?.data?.message
            ? (err as { response: { data: { message: string } } }).response.data.message
            : err instanceof Error
              ? err.message
              : "Failed to load top apps";
        setError(message);
      } finally {
        if (!isStale()) setIsLoading(false);
      }
    },
    [isAuthenticated, organizationId, orgTimezone],
  );

  // Drop the previous org's chips immediately rather than showing them
  // until the new org's request lands.
  useEffect(() => {
    setApps([]);
    setError(null);
  }, [organizationId]);

  // Midnight (and org-day rollover) must drop yesterday's chips like the clock.
  useEffect(() => {
    void reload();
  }, [reload, todayDate]);

  useEffect(() => {
    const onStopped = () => {
      void reload();
    };
    const onFlushed = () => {
      void reload({ silent: true });
    };
    window.addEventListener(TIMER_STOPPED_EVENT, onStopped);
    window.addEventListener(ACTIVITY_FLUSHED_EVENT, onFlushed);
    return () => {
      window.removeEventListener(TIMER_STOPPED_EVENT, onStopped);
      window.removeEventListener(ACTIVITY_FLUSHED_EVENT, onFlushed);
    };
  }, [reload]);

  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    const id = window.setInterval(() => {
      void reload();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, organizationId, reload]);

  return { apps, isLoading, error, reload };
}
