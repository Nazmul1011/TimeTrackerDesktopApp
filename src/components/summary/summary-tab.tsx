/**
 * Summary tab — month/week cards + top apps.
 */
"use client";

import { SUMMARY, TOP_APPS } from "@/constants/demo-data";
import { SummaryCard } from "@/components/summary/summary-card";

export function SummaryTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard
          title="This Month"
          value={`${SUMMARY.monthHours}h`}
          goal={`${SUMMARY.monthGoal}h`}
          expected={`${SUMMARY.monthExpected}h`}
        />
        <SummaryCard
          title="This Week"
          value={`${SUMMARY.weekHours}h`}
          goal={`${SUMMARY.weekGoal}h`}
          expected={`${SUMMARY.weekExpected}h`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--text-subtle)]">Top Apps</p>
        <div className="flex flex-wrap gap-2">
          {TOP_APPS.map((app) => (
            <div
              key={app.id}
              className="flex w-[57px] items-center justify-center gap-0.5 rounded-full bg-[var(--surface-elevated)] px-2 py-1.5"
              title={app.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={app.icon} alt={app.name} className="size-4" width={16} height={16} />
              <span className="text-[11px] leading-[14px] text-[var(--text-muted)]">{app.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
