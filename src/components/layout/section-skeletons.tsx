/**
 * Loading placeholders shaped like each section, shown until its first data
 * arrives (from the server or the saved offline copy). Same outer boxes as
 * the real content, so nothing jumps when it appears.
 */
"use client";

import { Skeleton } from "@/components/ui/skeleton";

/** Screen-reader text for a skeleton; the shapes themselves are hidden. */
function Busy({ label }: { label: string }) {
  return <span className="sr-only">{label}</span>;
}

export function TimesheetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      role="status"
      className="overflow-hidden rounded-xl border border-[#ededed] bg-white dark:border-[#334155] dark:bg-card"
    >
      <Busy label="Loading today's entries" />
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-2 border-b border-[#f3f4f6] px-3 py-3 last:border-b-0 dark:border-[#1e293b]"
        >
          <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 - index * 12}%` }} />
          <Skeleton className="h-6 w-20 rounded-lg" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="size-7 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ScreenshotGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div role="status" className="grid grid-cols-2 gap-2">
      <Busy label="Loading screenshots" />
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white p-1 dark:bg-card"
        >
          <Skeleton className="aspect-[179/106] w-full rounded-lg" />
          <div className="flex items-center justify-between px-1 py-1.5">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="size-4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div role="status" className="grid grid-cols-2 gap-2">
      <Busy label="Loading summary" />
      {[0, 1].map((index) => (
        <div key={index} className="overflow-hidden rounded-lg bg-[var(--surface-elevated)]">
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-white px-3 py-3 dark:bg-card">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex gap-1 px-2 py-1.5">
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppChipsSkeleton({ chips = 5 }: { chips?: number }) {
  return (
    <div role="status" className="flex flex-wrap gap-2">
      <Busy label="Loading apps" />
      {Array.from({ length: chips }, (_, index) => (
        <Skeleton
          key={index}
          className="h-7 rounded-full"
          style={{ width: 57 + (index % 3) * 10 }}
        />
      ))}
    </div>
  );
}

export function NotificationListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" className="flex flex-col">
      <Busy label="Loading notifications" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-start gap-2.5 px-3 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <Skeleton className="h-3" style={{ width: `${75 - (index % 2) * 20}%` }} />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div role="status" className="flex w-full flex-col gap-3">
      <Busy label="Loading profile" />
      <div className="surface-card flex items-center gap-3 p-4">
        <Skeleton className="size-12 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="surface-card flex w-full flex-col gap-4 p-4">
        <Skeleton className="h-3.5 w-24" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        ))}
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    </div>
  );
}

export function RequestListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-1">
      <Busy label="Loading requests" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-12 w-20 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-7 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}
