/**
 * Personal summary stats — This Month / This Week from /reports/summary.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { monthEndYmd, monthStartYmd, todayInZone, weekEndYmd, weekStartYmd } from "@/lib/org-date";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { reportsApi } from "@/services/api/reports.api";
import { useAuthStore } from "@/store/auth.store";

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

    // Ranges follow the org's calendar, matching how the backend stores days.
    const timeZone = orgTimezone;
    const today = todayInZone(timeZone);
    const monthStart = monthStartYmd(timeZone);
    const monthEnd = monthEndYmd(timeZone);
    const weekStart = weekStartYmd(timeZone);
    const weekEnd = weekEndYmd(timeZone);

    try {
      const [monthSoFar, monthGoal, weekSoFar, weekGoal] = await Promise.all([
        reportsApi.getSummary({ startDate: monthStart, endDate: today }),
        reportsApi.getSummary({ startDate: monthStart, endDate: monthEnd }),
        reportsApi.getSummary({ startDate: weekStart, endDate: today }),
        reportsApi.getSummary({ startDate: weekStart, endDate: weekEnd }),
      ]);

      if (isStale()) return;

      setStats({
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
      });
    } catch (err) {
      if (isStale()) return;
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
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onStopped = () => {
      void reload();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, onStopped);
    return () => window.removeEventListener(TIMER_STOPPED_EVENT, onStopped);
  }, [reload]);

  // Light refresh while the app is open (new entries / remote sync)
  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    const id = window.setInterval(() => {
      void reload();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, organizationId, reload]);

  return { stats, isLoading, error, reload };
}
