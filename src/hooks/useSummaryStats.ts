/**
 * Personal summary stats — This Month / This Week from /reports/summary.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { monthEndYmd, monthStartYmd, todayInZone, weekEndYmd, weekStartYmd } from "@/lib/org-date";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { isPageHidden, onPageVisible } from "@/lib/visibility";
import { isOfflineError } from "@/lib/offline-error";
import { reportsApi } from "@/services/api/reports.api";
import { useAuthStore } from "@/store/auth.store";
import { CONNECTION_RESTORED_EVENT } from "@/store/connection.store";
import { listOfflineSessions, offlineSecondsOn } from "@/lib/offline-time";
import { todayInUserZone } from "@/lib/org-date";
import { readCachedView, writeCachedView } from "@/lib/view-cache";

export type PeriodSummary = {
  title: string;
  loggedHours: number;
  goalHours: number;
  expectedSoFarHours: number;
};

export type SummaryStats = {
  month: PeriodSummary;
  week: PeriodSummary;
};

function emptyStats(): SummaryStats {
  return {
    month: {
      title: "This Month",
      loggedHours: 0,
      goalHours: 0,
      expectedSoFarHours: 0,
    },
    week: {
      title: "This Week",
      loggedHours: 0,
      goalHours: 0,
      expectedSoFarHours: 0,
    },
  };
}

const SUMMARY_CACHE = "summary";

/** Hours stopped offline today: in this week and month, not on the server yet. */
async function offlineHoursToday(): Promise<number> {
  return offlineSecondsOn(await listOfflineSessions(), todayInUserZone()) / 3600;
}

function withExtraHours(stats: SummaryStats, hours: number): SummaryStats {
  if (hours <= 0) return stats;
  return {
    month: { ...stats.month, loggedHours: stats.month.loggedHours + hours },
    week: { ...stats.week, loggedHours: stats.week.loggedHours + hours },
  };
}

/** `17h 29m` — hours and leftover minutes (not rounded away). */
export function formatSummaryHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

export function useSummaryStats() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();
  const [stats, setStats] = useState<SummaryStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  // Set while the numbers on screen are the saved copy.
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !organizationId) {
      setStats(emptyStats());
      setIsLoading(false);
      return;
    }

    // A reply for the org we just left must never overwrite the current one.
    const requestedOrg = organizationId;
    const isStale = () => useAuthStore.getState().organizationId !== requestedOrg;

    setIsLoading(true);
    setError(null);
    setOffline(false);

    // Ranges follow the org's calendar, matching how the backend stores days.
    const timeZone = orgTimezone;
    const today = todayInZone(timeZone);
    const monthStart = monthStartYmd(timeZone);
    const monthEnd = monthEndYmd(timeZone);
    const weekStart = weekStartYmd(timeZone);
    const weekEnd = weekEndYmd(timeZone);
    const cacheParam = `${monthStart}:${weekStart}:${today}`;

    try {
      const [monthSoFar, monthGoal, weekSoFar, weekGoal] = await Promise.all([
        reportsApi.getSummary({ startDate: monthStart, endDate: today }),
        reportsApi.getSummary({ startDate: monthStart, endDate: monthEnd }),
        reportsApi.getSummary({ startDate: weekStart, endDate: today }),
        reportsApi.getSummary({ startDate: weekStart, endDate: weekEnd }),
      ]);

      if (isStale()) return;

      const fresh: SummaryStats = {
        month: {
          title: "This Month",
          loggedHours: monthSoFar.totalLoggedHours,
          goalHours: monthGoal.expectedHours,
          expectedSoFarHours: monthSoFar.expectedHours,
        },
        week: {
          title: "This Week",
          loggedHours: weekSoFar.totalLoggedHours,
          goalHours: weekGoal.expectedHours,
          expectedSoFarHours: weekSoFar.expectedHours,
        },
      };
      writeCachedView(SUMMARY_CACHE, cacheParam, fresh);
      const extra = await offlineHoursToday();
      if (isStale()) return;
      setSavedAt(null);
      setStats(withExtraHours(fresh, extra));
    } catch (err) {
      if (isStale()) return;
      if (isOfflineError(err)) {
        setOffline(true);
        setError(null);
        // Show this week and month as last loaded, plus time tracked offline.
        const saved = readCachedView<SummaryStats>(SUMMARY_CACHE, cacheParam);
        if (saved) {
          const extra = await offlineHoursToday();
          if (isStale()) return;
          setStats(withExtraHours(saved.data, extra));
          setSavedAt(saved.savedAt);
        }
        return;
      }
      // Never leave the previous org's hours on screen behind an error.
      setStats(emptyStats());
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : err instanceof Error
            ? err.message
            : "Failed to load summary";
      setError(message);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }, [isAuthenticated, organizationId, orgTimezone]);

  // Drop the previous org's numbers immediately rather than showing them
  // until the new org's request lands.
  useEffect(() => {
    setStats(emptyStats());
    setError(null);
    setOffline(false);
    setSavedAt(null);
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onStopped = () => {
      void reload();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, onStopped);
    window.addEventListener(CONNECTION_RESTORED_EVENT, onStopped);
    return () => {
      window.removeEventListener(TIMER_STOPPED_EVENT, onStopped);
      window.removeEventListener(CONNECTION_RESTORED_EVENT, onStopped);
    };
  }, [reload]);

  // Light refresh while the app is open (new entries / remote sync)
  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    const id = window.setInterval(() => {
      if (isPageHidden()) return;
      void reload();
    }, 120_000);
    const unsubVisible = onPageVisible(() => void reload());
    return () => {
      window.clearInterval(id);
      unsubVisible();
    };
  }, [isAuthenticated, organizationId, reload]);

  return { stats, isLoading, error, offline, savedAt, reload };
}
