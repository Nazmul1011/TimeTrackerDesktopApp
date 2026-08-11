/**
 * Activity hook — scaffolding.
 */
"use client";

import { useActivityStore } from "@/store/activity.store";

export function useActivity() {
  const activities = useActivityStore((s) => s.activities);
  const activeMs = useActivityStore((s) => s.activeMs);
  const idleMs = useActivityStore((s) => s.idleMs);
  const setSummary = useActivityStore((s) => s.setSummary);

  return {
    activities,
    activeMs,
    idleMs,
    setSummary,
  };
}
