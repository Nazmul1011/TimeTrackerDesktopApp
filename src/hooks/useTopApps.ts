/**
 * Top Apps — live usage from /activity/apps (this week, exclude idle).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { iconForAppName } from "@/lib/app-name";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { activityApi } from "@/services/api/activity.api";
import { toIsoDate } from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";

export type TopAppChip = {
  id: string;
  name: string;
  percent: number;
  icon: string | null;
  totalDuration: number;
};

function startOfWeekMonday(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function letterIconDataUrl(name: string): string {
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#e5e7eb"/><text x="8" y="12" text-anchor="middle" font-size="9" font-family="system-ui,sans-serif" fill="#4a5565">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function useTopApps() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [apps, setApps] = useState<TopAppChip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !organizationId) {
      setApps([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const now = new Date();
    const weekStart = toIsoDate(startOfWeekMonday(now));
    const today = toIsoDate(now);

    try {
      let rows = await activityApi.getApps({
        startDate: weekStart,
        endDate: today,
        excludeIdle: true,
      });

      // If this week is empty, try today only (edge case of clock/tz), else keep empty
      if (rows.length === 0) {
        rows = await activityApi.getApps({
          startDate: today,
          endDate: today,
          excludeIdle: true,
        });
      }

      const top = rows.slice(0, 6).map((row) => ({
        id: row.appName,
        name: row.appName,
        percent: row.percent ?? 0,
        icon: iconForAppName(row.appName) ?? letterIconDataUrl(row.appName),
        totalDuration: row.totalDuration,
      }));

      setApps(top);
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
            : "Failed to load top apps";
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

  // Refresh while timer is running so chips update as samples flush
  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    const id = window.setInterval(() => {
      void reload();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [isAuthenticated, organizationId, reload]);

  return { apps, isLoading, error, reload };
}
