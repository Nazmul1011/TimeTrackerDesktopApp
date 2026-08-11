/**
 * Summary metric card — Figma style.
 */
"use client";

interface SummaryCardProps {
  title: string;
  value: string;
  goal?: string;
  expected?: string;
}

export function SummaryCard({ title, value, goal, expected }: SummaryCardProps) {
  return (
    <div className="overflow-hidden rounded-lg bg-[var(--surface-elevated)]">
      <div className="rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-3">
        <p className="text-xs text-[var(--text-subtle)]">{title}</p>
        <div className="mt-0.5 flex items-end gap-0.5">
          <span className="text-base font-normal text-[#1e2939]">{value}</span>
          {goal && (
            <span className="pb-px text-xs text-[var(--text-muted)]">
              / {goal}
            </span>
          )}
        </div>
      </div>
      {expected && (
        <div className="flex gap-1 px-2 py-1 text-xs">
          <span className="text-[var(--text-muted)]">Expected so far</span>
          <span className="text-[var(--text-subtle)]">{expected}</span>
        </div>
      )}
    </div>
  );
}
