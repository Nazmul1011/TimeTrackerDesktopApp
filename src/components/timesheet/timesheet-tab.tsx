/**
 * Timesheet tab — list of entries with play actions.
 */
"use client";

import { useState } from "react";
import { INITIAL_TIMESHEET, type TimesheetEntry } from "@/constants/demo-data";
import { TimesheetRow } from "@/components/timesheet/timesheet-row";
import { useTimer } from "@/hooks/useTimer";
import { toast } from "sonner";

function formatShort(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `00:${String(m).padStart(2, "0")}`;
}

export function TimesheetTab() {
  const [entries, setEntries] = useState<TimesheetEntry[]>(INITIAL_TIMESHEET);
  const { start, isRunning, stop } = useTimer();

  const handlePlay = (entry: TimesheetEntry) => {
    if (isRunning) void stop();
    // Demo rows use non-UUID ids — start without project until timesheet is API-backed
    void start(null);
    setEntries((prev) =>
      prev.map((e) => ({ ...e, isActive: e.id === entry.id })),
    );
    toast.success(`Tracking: ${entry.title}`);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white">
      {entries.map((entry) => (
        <TimesheetRow
          key={entry.id}
          title={entry.title}
          projectLabel={entry.projectLabel}
          duration={formatShort(entry.durationMs)}
          isActive={entry.isActive}
          unlinked={entry.unlinked}
          onPlay={() => handlePlay(entry)}
        />
      ))}
    </div>
  );
}
