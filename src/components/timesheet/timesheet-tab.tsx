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
import { useTimerStore } from "@/store/timer.store";
import { CONNECTION_RESTORED_EVENT, useConnectionStore } from "@/store/connection.store";
import { SavedCopyNote } from "@/components/layout/saved-copy-note";
import { TimesheetSkeleton } from "@/components/layout/section-skeletons";
import { isOfflineRowId, loadOfflineOverlay } from "@/lib/offline-overlay";
import { todayInUserZone, todayInZone } from "@/lib/org-date";
import { readCachedView, writeCachedView } from "@/lib/view-cache";

const TIMESHEET_CACHE = "timesheetToday";

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
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const online = useConnectionStore((s) => s.online);

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
    const day = todayInZone(orgTimezone);
    let rows: ApiTimeEntry[] = [];
    let copySavedAt: number | null = null;
    try {
      rows = await timesheetApi.listToday(orgTimezone);
      if (!isStale()) writeCachedView(TIMESHEET_CACHE, day, rows);
    } catch {
      // Server unreachable: today's saved copy, if there is one.
      const saved = readCachedView<ApiTimeEntry[]>(TIMESHEET_CACHE, day);
      rows = saved?.data ?? [];
      copySavedAt = saved?.savedAt ?? null;
    }
    try {
      // Sessions stopped offline are not on the server yet.
      const offline = await loadOfflineOverlay(undefined, { sessions: true });
      if (isStale()) return;
      const today = offline.entries.filter((entry) => entry.date === todayInUserZone());
      setSavedAt(copySavedAt);
      setEntries(
        [...rows, ...today].sort(
          (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
        ),
      );
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [organizationId, orgTimezone]);

  const todayDate = useTimerStore((s) => s.todayDate);

  // Drop the previous org's entries immediately rather than showing them
  // until the new org's request lands.
  useEffect(() => {
    setEntries([]);
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [todayDate, reload]);

  useEffect(() => {
    const handler = () => {
      void reload();
    };
    window.addEventListener(TIMER_STOPPED_EVENT, handler);
    window.addEventListener(CONNECTION_RESTORED_EVENT, handler);
    return () => {
      window.removeEventListener(TIMER_STOPPED_EVENT, handler);
      window.removeEventListener(CONNECTION_RESTORED_EVENT, handler);
    };
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
          pending: isOfflineRowId(entry.id),
        };
      }),
    [entries, isRunning, latestIdByProject, liveProjectKey],
  );

  // Placeholder only until something can be shown; reloads keep the list.
  if (loading && !rows.length) {
    return <TimesheetSkeleton />;
  }

  if (!rows.length) {
    return (
      <>
        <SavedCopyNote savedAt={savedAt} className="mb-1.5" />
        <div className="overflow-hidden rounded-xl border border-[#ededed] bg-white p-4 text-center text-xs text-[#99a1af] dark:border-[#334155] dark:bg-card dark:text-[#64748b]">
          {isRunning || isPaused
            ? "Timer is currently active. Completed time will appear here when paused or stopped."
            : "No time logged today. Start the timer to track time."}
        </div>
      </>
    );
  }

  return (
    <>
      <SavedCopyNote savedAt={savedAt} className="mb-1.5" />
      <div className="max-h-[min(280px,calc(100vh-340px))] overflow-y-auto overflow-x-hidden rounded-xl border border-[#ededed] bg-white dark:border-[#334155] dark:bg-card">
        {rows.map(
          (
            { entry, title, projectLabel, duration, isActive, playState, playEnabled, pending },
            index,
          ) => (
            <TimesheetRow
              key={entry.id}
              entry={entry}
              title={title}
              projectLabel={projectLabel}
              duration={duration}
              isActive={isActive}
              playState={playState}
              playEnabled={playEnabled}
              // Edit and delete go to the server; offline rows are not there yet.
              showMenu={!isActive && online && !pending}
              pendingUpload={pending}
              compact={index === 0}
              onPlay={() => handleRowControl(entry.projectId ?? null)}
              onSave={(payload) => handleSaveEdit(entry, payload)}
              onDelete={() => handleDelete(entry)}
            />
          ),
        )}
      </div>
    </>
  );
}
