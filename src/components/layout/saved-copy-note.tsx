/**
 * Small line under a section that is showing its saved copy instead of live
 * data, so the user knows how old the numbers are.
 */
"use client";

import { History } from "lucide-react";
import { dayjs } from "@/lib/dayjs";

export function savedCopyLabel(savedAt: number): string {
  const saved = dayjs(savedAt);
  const sameDay = saved.isSame(dayjs(), "day");
  return sameDay ? saved.format("h:mm A") : saved.format("MMM D, h:mm A");
}

export function SavedCopyNote({
  savedAt,
  className = "",
}: {
  savedAt: number | null;
  className?: string;
}) {
  if (!savedAt) return null;
  return (
    <p
      className={`flex items-center gap-1 text-[10px] leading-4 text-[#99a1af] dark:text-[#64748b] ${className}`}
    >
      <History className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        Saved copy from {savedCopyLabel(savedAt)} · updates when you&apos;re back online
      </span>
    </p>
  );
}
