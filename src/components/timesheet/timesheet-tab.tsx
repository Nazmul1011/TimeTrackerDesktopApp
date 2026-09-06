/**
 * Timesheet tab — today's individual entries with inline edit and delete modal.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TimesheetRow } from "@/components/timesheet/timesheet-row";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import { useTimer } from "@/hooks/useTimer";
import { formatTimesheetDuration } from "@/lib/project-icons";
import { TIMER_STOPPED_EVENT } from "@/lib/timer-events";
import { timesheetApi, type ApiTimeEntry } from "@/services/api/timesheet.api";
import { useAuthStore } from "@/store/auth.store";

function entryTitle(entry: ApiTimeEntry): string {
  return entry.description?.trim() || entry.project?.name || "General";
}

export function TimesheetTab() {
  const organizationId = useAuthStore((s) => s.organizationId);
  // Arrives with the org list, after the first render on a cold start.
  const orgTimezone = useOrgTimezone();
  const { timer, start, pause, resume, isRunning, isPaused, stop } = useTimer();
  const [entries, setEntries] = useState<ApiTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!organizationId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    // A reply for the org we just left must never overwrite the current one.
    const requestedOrg = organizationId;
    const isStale = () => useAuthStore.getState().organizationId !== requestedOrg;

    setLoading(true);
    try {
      const rows = await timesheetApi.listToday(orgTimezone);
      if (isStale()) return;
      setEntries(
        rows.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
      );
    } catch {
      if (isStale()) return;
      setEntries([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [organizationId, orgTimezone]);

  // Drop the previous org's entries immediately rather than showing them
  // until the new org's request lands.
  useEffect(() => {
    setEntries([]);
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

  const handleRowControl = (projectId: string | null) => {
    const sameProject = (timer.projectId ?? null) === projectId;
    if (sameProject && isRunning) {
      void pause();
      return;
    }
    if (sameProject && isPaused) {
      void resume();
      return;
    }
    if (isRunning || isPaused) void stop();
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

  const latestIdByProject = useMemo(() => {
    const seen = new Set<string>();
    const latest = new Set<string>();
    for (const entry of entries) {
      const key = entry.projectId ?? "general";
      if (seen.has(key)) continue;
      seen.add(key);
      latest.add(entry.id);
    }
    return latest;
  }, [entries]);

  const liveProjectKey = isRunning || isPaused ? (timer.projectId ?? "general") : null;

  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const isLatest = latestIdByProject.has(entry.id);
        const sameLiveProject =
          liveProjectKey !== null && (entry.projectId ?? "general") === liveProjectKey;
        return {
          entry,
          title: entryTitle(entry),
          projectLabel: entry.project?.name ?? "General",
          duration: formatTimesheetDuration(entry.duration ?? 0),
          isActive: isLatest && sameLiveProject,
          playEnabled: isLatest,
          playState:
            isLatest && sameLiveProject && isRunning ? ("running" as const) : ("paused" as const),
        };
      }),
    [entries, isRunning, latestIdByProject, liveProjectKey],
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
      {rows.map(
        ({ entry, title, projectLabel, duration, isActive, playState, playEnabled }, index) => (
          <TimesheetRow
            key={entry.id}
            entry={entry}
            title={title}
            projectLabel={projectLabel}
            duration={duration}
            isActive={isActive}
            playState={playState}
            playEnabled={playEnabled}
            showMenu={!isActive}
            compact={index === 0}
            onPlay={() => handleRowControl(entry.projectId ?? null)}
            onSave={(payload) => handleSaveEdit(entry, payload)}
            onDelete={() => handleDelete(entry)}
          />
        ),
      )}
    </div>
  );
}
