/**
 * Summary tab — month/week cards + live Top Apps from activity tracking.
 */
"use client";

import { SummaryCard } from "@/components/summary/summary-card";
import {
  formatSummaryHours,
  useSummaryStats,
} from "@/hooks/useSummaryStats";
import { useTopApps } from "@/hooks/useTopApps";

export function SummaryTab() {
  const { stats, isLoading, error, reload } = useSummaryStats();
  const {
    apps: topApps,
    isLoading: appsLoading,
    error: appsError,
    reload: reloadApps,
  } = useTopApps();

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-lg border border-[#ededed] bg-white px-3 py-2 text-center">
          <p className="text-xs text-[#99a1af]">{error}</p>
          <button
            type="button"
            className="mt-1 text-xs font-medium text-[#2b7fff]"
            onClick={() => void reload()}
          >
            Retry
          </button>
        </div>
      ) : null}

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

      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--text-subtle)]">Top Apps</p>
        {appsError ? (
          <div className="rounded-lg border border-[#ededed] bg-white px-3 py-2 text-center">
            <p className="text-xs text-[#99a1af]">{appsError}</p>
            <button
              type="button"
              className="mt-1 text-xs font-medium text-[#2b7fff]"
              onClick={() => void reloadApps()}
            >
              Retry
            </button>
          </div>
        ) : null}
        {appsLoading && topApps.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>
        ) : null}
        {!appsLoading && topApps.length === 0 && !appsError ? (
          <p className="text-[11px] leading-4 text-[var(--text-muted)]">
            Start the timer to track which apps you use. Usage appears here
            after a short sync.
          </p>
        ) : null}
        {topApps.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topApps.map((app) => (
              <div
                key={app.id}
                className="flex min-w-[57px] items-center justify-center gap-0.5 rounded-full bg-[var(--surface-elevated)] px-2 py-1.5"
                title={`${app.name} — ${app.percent}% of tracked time this week`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={app.icon ?? undefined}
                  alt={app.name}
                  className="size-4"
                  width={16}
                  height={16}
                />
                <span className="text-[11px] leading-[14px] text-[var(--text-muted)]">
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
