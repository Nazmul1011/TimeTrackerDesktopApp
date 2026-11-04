/**
 * Summary tab — month/week cards + live Top Apps from activity tracking.
 */
"use client";

import { useState } from "react";
import { SavedCopyNote } from "@/components/layout/saved-copy-note";
import { AppChipsSkeleton, SummaryCardsSkeleton } from "@/components/layout/section-skeletons";
import { SummaryCard } from "@/components/summary/summary-card";
import { formatSummaryHours, useSummaryStats } from "@/hooks/useSummaryStats";
import { useTopApps } from "@/hooks/useTopApps";
import { formatProjectTriggerTime } from "@/lib/project-icons";

function AppIcon({ name, icon }: { name: string; icon: string | null }) {
  const [failed, setFailed] = useState(false);
  const letter = (name.trim().charAt(0) || "?").toUpperCase();

  if (!icon || failed) {
    return (
      <span
        className="flex size-4 items-center justify-center rounded-[3px] bg-[#e5e7eb] text-[9px] font-semibold leading-none text-[#4a5565] dark:bg-[#334155] dark:text-[#94a3b8]"
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={icon}
      alt=""
      className="size-4 rounded-[3px] object-contain"
      width={16}
      height={16}
      onError={() => setFailed(true)}
    />
  );
}

export function SummaryTab() {
  const { stats, isLoading, error, offline, savedAt, reload } = useSummaryStats();
  const {
    apps: topApps,
    isLoading: appsLoading,
    error: appsError,
    offline: appsOffline,
    savedAt: appsSavedAt,
    reload: reloadApps,
  } = useTopApps();
  const showOffline = offline || appsOffline;
  // Nothing loaded yet (first load): placeholders instead of 0h 0m.
  const summaryPending =
    isLoading &&
    stats.month.loggedHours === 0 &&
    stats.month.goalHours === 0 &&
    stats.week.loggedHours === 0 &&
    stats.week.goalHours === 0;
  // Oldest copy on screen, so the note never claims fresher data than shown.
  const copyAt = savedAt && appsSavedAt ? Math.min(savedAt, appsSavedAt) : (savedAt ?? appsSavedAt);

  return (
    <div className="flex flex-col gap-4">
      {copyAt ? (
        <SavedCopyNote savedAt={copyAt} />
      ) : showOffline ? (
        <p className="text-[11px] leading-4 text-[#99a1af] dark:text-[#64748b]">
          Offline. Totals and apps update when the connection is back.
        </p>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-[#ededed] bg-white px-3 py-2 text-center dark:border-[#334155] dark:bg-card">
          <p className="text-xs text-[#99a1af] dark:text-[#64748b]">{error}</p>
          <button
            type="button"
            className="mt-1 text-xs font-medium text-[#2b7fff]"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {summaryPending ? (
        <SummaryCardsSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard
            title={stats.month.title}
            value={
              isLoading && stats.month.loggedHours === 0
                ? "—"
                : formatSummaryHours(stats.month.loggedHours)
            }
            goal={formatSummaryHours(stats.month.goalHours)}
            expected={formatSummaryHours(stats.month.expectedSoFarHours)}
          />
          <SummaryCard
            title={stats.week.title}
            value={
              isLoading && stats.week.loggedHours === 0
                ? "—"
                : formatSummaryHours(stats.week.loggedHours)
            }
            goal={formatSummaryHours(stats.week.goalHours)}
            expected={formatSummaryHours(stats.week.expectedSoFarHours)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--text-subtle)]">
          Top Apps{topApps.length > 0 ? ` (${topApps.length})` : ""}
        </p>
        {appsError ? (
          <div className="rounded-lg border border-[#ededed] bg-white px-3 py-2 text-center dark:border-[#334155] dark:bg-card">
            <p className="text-xs text-[#99a1af] dark:text-[#64748b]">{appsError}</p>
            <button
              type="button"
              className="mt-1 text-xs font-medium text-[#2b7fff]"
              onClick={() => void reloadApps()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {appsLoading && topApps.length === 0 ? <AppChipsSkeleton /> : null}
        {!appsLoading && topApps.length === 0 && !appsError && !appsOffline ? (
          <p className="text-[11px] leading-4 text-[var(--text-muted)]">
            Start the timer to track which apps you use today. Usage appears here after a short
            sync.
          </p>
        ) : null}
        {topApps.length > 0 ? (
          <div className="flex max-h-[min(152px,calc(100vh-420px))] flex-wrap gap-2 overflow-y-auto overflow-x-hidden">
            {topApps.map((app) => (
              <div
                key={app.id}
                className="flex min-w-[57px] items-center justify-center gap-1 rounded-full bg-[var(--surface-elevated)] px-2 py-1.5"
                title={`${app.name} — ${formatProjectTriggerTime(app.totalDuration)} (${app.percent}% of tracked time today)`}
              >
                <AppIcon name={app.name} icon={app.icon} />
                <span className="text-[11px] leading-[14px] text-[var(--text-muted)]">
                  {formatProjectTriggerTime(app.totalDuration)}
                </span>
                <span className="text-[11px] leading-[14px] text-[var(--text-subtle)]">
                  {app.percent}%
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
