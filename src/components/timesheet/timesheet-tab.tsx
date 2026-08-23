/**
 * Timesheet tab — today's saved entries from the backend.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { TimesheetRow } from "@/components/timesheet/timesheet-row";
import { useTimer } from "@/hooks/useTimer";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import {
  timesheetApi,
  type ApiTimeEntry,
} from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";

function formatShort(seconds: number): string {
  const totalSec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `00:${String(m).padStart(2, "0")}`;
}

function mapEntry(entry: ApiTimeEntry) {
  return {
    id: entry.id,
    title: entry.description || entry.project?.name || "Time entry",
    projectLabel: entry.project?.name ?? "No project",
    duration: formatShort(entry.duration ?? 0),
  };
}

export function TimesheetTab() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const { timer, start, isRunning, stop } = useTimer();
  const [entries, setEntries] = useState<
    Array<ReturnType<typeof mapEntry> & { isActive: boolean }>
  >([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await timesheetApi.listToday();
      setEntries(
        rows.map((entry) => ({
          ...mapEntry(entry),
          isActive: false,
        })),
      );
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, handler);
    return () => window.removeEventListener(TIMER_STOPPED_EVENT, handler);
  }, [reload]);

  const handlePlay = (projectId: string | null) => {
    if (isRunning) void stop();
    void start(projectId);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
        Loading today&apos;s entries…
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-white p-4 text-center text-xs text-[var(--text-muted)]">
        No time logged today. Start the timer to track time.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
      {entries.map((entry) => (
        <TimesheetRow
          key={entry.id}
          title={entry.title}
          projectLabel={entry.projectLabel}
          duration={entry.duration}
          isActive={timer.status === "running" && entry.isActive}
          onPlay={() => handlePlay(null)}
        />
      ))}
    </div>
  );
}
