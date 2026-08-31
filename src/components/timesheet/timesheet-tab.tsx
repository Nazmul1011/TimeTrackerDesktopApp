/**
 * Timesheet tab — today's entries grouped by project (Figma 17623:47863).
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TimesheetRow } from "@/components/timesheet/timesheet-row";
import { useTimer } from "@/hooks/useTimer";
import { formatTimesheetDuration } from "@/lib/project-icons";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import {
  timesheetApi,
  type ApiTimeEntry,
} from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";

type TimesheetGroup = {
  id: string;
  projectId: string | null;
  title: string;
  projectLabel: string;
  durationSeconds: number;
  unlinked: boolean;
};

function aggregateEntries(rows: ApiTimeEntry[]): TimesheetGroup[] {
  const groups = new Map<string, TimesheetGroup>();

  for (const entry of rows) {
    const projectId = entry.projectId ?? entry.project?.id ?? null;
    const projectName = entry.project?.name ?? null;
    // null projectId = intentional "General" (no specific project), not Unlinked
    const isGeneral = !projectId;
    const title =
      entry.description?.trim() ||
      projectName ||
      (isGeneral ? "General" : "Time entry");
    const key = isGeneral ? `general:${title}` : `${projectId}:${title}`;

    const existing = groups.get(key);
    if (existing) {
      existing.durationSeconds += entry.duration ?? 0;
    } else {
      groups.set(key, {
        id: key,
        projectId,
        title,
        projectLabel: projectName ?? "General",
        durationSeconds: entry.duration ?? 0,
        unlinked: false,
      });
    }
  }

  return [...groups.values()].sort((a, b) => b.durationSeconds - a.durationSeconds);
}

export function TimesheetTab() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const { timer, start, isRunning, isPaused, stop } = useTimer();
  const [entries, setEntries] = useState<TimesheetGroup[]>([]);
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
      setEntries(aggregateEntries(rows));
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

  const activeProjectId = isRunning || isPaused ? timer.projectId : null;

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        ...entry,
        duration: formatTimesheetDuration(entry.durationSeconds),
        isActive: entry.projectId === activeProjectId,
      })),
    [activeProjectId, entries],
  );

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white p-4 text-center text-xs text-[#99a1af]">
        Loading today&apos;s entries…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white p-4 text-center text-xs text-[#99a1af]">
        No time logged today. Start the timer to track time.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white">
      {rows.map((entry, index) => (
        <TimesheetRow
          key={entry.id}
          title={entry.title}
          projectLabel={entry.projectLabel}
          duration={entry.duration}
          isActive={entry.isActive}
          unlinked={entry.unlinked}
          showMenu={!entry.isActive}
          compact={index === 0}
          onPlay={() => handlePlay(entry.projectId)}
        />
      ))}
    </div>
  );
}
