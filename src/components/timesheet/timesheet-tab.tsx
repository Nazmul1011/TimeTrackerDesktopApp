/**
 * Timesheet tab — today's individual entries with inline edit and delete modal.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TimesheetRow } from "@/components/timesheet/timesheet-row";
import { useTimer } from "@/hooks/useTimer";
import { formatTimesheetDuration } from "@/lib/project-icons";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import {
  timesheetApi,
  type ApiTimeEntry,
} from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";

function entryTitle(entry: ApiTimeEntry): string {
  return entry.description?.trim() || entry.project?.name || "General";
}

export function TimesheetTab() {
  const organizationId = useAuthStore((s) => s.organizationId);
  const { timer, start, isRunning, isPaused, stop } = useTimer();
  const [entries, setEntries] = useState<ApiTimeEntry[]>([]);
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
        rows.sort(
          (a, b) =>
            new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        ),
      );
    } catch {
      // Keep cached rows when offline so a stop doesn't blank the timesheet.
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

  const handleDelete = async (entry: ApiTimeEntry) => {
    try {
      await timesheetApi.delete(entry.id);
      toast.success("Time entry deleted");
      await reload();
    } catch {
      toast.error("Could not delete time entry");
      throw new Error("delete failed");
    }
  };

  const handleSaveEdit = async (
    entry: ApiTimeEntry,
    payload: { description: string; projectId: string | null },
  ) => {
    try {
      await timesheetApi.update(entry.id, payload);
      toast.success("Time entry updated");
      await reload();
    } catch {
      toast.error("Could not update time entry");
      throw new Error("update failed");
    }
  };

  const activeProjectId = isRunning || isPaused ? timer.projectId : null;

  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        title: entryTitle(entry),
        projectLabel: entry.project?.name ?? "General",
        duration: formatTimesheetDuration(entry.duration ?? 0),
        isActive: entry.projectId === activeProjectId && (isRunning || isPaused),
      })),
    [activeProjectId, entries, isPaused, isRunning],
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
    <div className="max-h-[min(280px,calc(100vh-340px))] overflow-y-auto overflow-x-hidden rounded-xl border border-[#ededed] bg-white">
      {rows.map(({ entry, title, projectLabel, duration, isActive }, index) => (
        <TimesheetRow
          key={entry.id}
          entry={entry}
          title={title}
          projectLabel={projectLabel}
          duration={duration}
          isActive={isActive}
          showMenu={!isActive}
          compact={index === 0}
          onPlay={() => handlePlay(entry.projectId ?? null)}
          onSave={(payload) => handleSaveEdit(entry, payload)}
          onDelete={() => handleDelete(entry)}
        />
      ))}
    </div>
  );
}
