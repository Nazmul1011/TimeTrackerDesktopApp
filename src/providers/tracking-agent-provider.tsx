/**
 * Keeps the desktop tracking agent alive across route changes.
 * Screenshots, idle pause, and activity sampling must not stop on Settings/Profile.
 */
"use client";

import { useTrackingAgent } from "@/hooks/useTrackingAgent";
import { useTimerSync } from "@/hooks/useTimerSync";
import { useTrayMenu } from "@/hooks/useTrayMenu";
import { useTrayTimerStatus } from "@/hooks/useTrayTimerStatus";

export function TrackingAgentProvider({ children }: { children: React.ReactNode }) {
  useTrackingAgent();
  useTimerSync({ onFocus: true });
  useTrayMenu();
  useTrayTimerStatus();
  return <>{children}</>;
}
