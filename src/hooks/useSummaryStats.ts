/**
 * Personal summary stats — This Month / This Week from /reports/summary.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { dayjs } from "@/lib/dayjs";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { reportsApi } from "@/services/api/reports.api";
import { toIsoDate } from "@/services/api/timesheet.api";
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

function startOfWeekMonday(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function endOfWeekSunday(date = new Date()): Date {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

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

/** Display like Figma: `84h` (whole hours). */
export function formatSummaryHours(hours: number): string {
  const n = Math.max(0, Math.round(hours));
  return `${n}h`;
}

export function useSummaryStats() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [stats, setStats] = useState<SummaryStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !organizationId) {
      setStats(emptyStats());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const now = new Date();
    const today = toIsoDate(now);
    const monthStart = toIsoDate(dayjs(now).startOf("month").toDate());
    const monthEnd = toIsoDate(dayjs(now).endOf("month").toDate());
    const weekStart = toIsoDate(startOfWeekMonday(now));
    const weekEnd = toIsoDate(endOfWeekSunday(now));

    try {
      const [monthSoFar, monthGoal, weekSoFar, weekGoal] = await Promise.all([
        reportsApi.getSummary({ startDate: monthStart, endDate: today }),
        reportsApi.getSummary({ startDate: monthStart, endDate: monthEnd }),
        reportsApi.getSummary({ startDate: weekStart, endDate: today }),
        reportsApi.getSummary({ startDate: weekStart, endDate: weekEnd }),
      ]);

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
      const message =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message
          ? (err as { response: { data: { message: string } } }).response.data
              .message
          : err instanceof Error
            ? err.message
            : "Failed to load summary";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, organizationId]);

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
