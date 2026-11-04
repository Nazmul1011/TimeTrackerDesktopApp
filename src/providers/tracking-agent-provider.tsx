/**
 * Keeps the desktop tracking agent alive across route changes.
 * Screenshots, idle pause, and activity sampling must not stop on Settings/Profile.
 * Also owns the connection state and the offline banner shown on every route.
 */
"use client";

import { ConnectionBanner } from "@/components/layout/connection-banner";
import { useConnectionMonitor } from "@/hooks/useConnectionMonitor";
import { useTrackingAgent } from "@/hooks/useTrackingAgent";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useTimerSync } from "@/hooks/useTimerSync";
import { useTrayMenu } from "@/hooks/useTrayMenu";
import { useTrayTimerStatus } from "@/hooks/useTrayTimerStatus";

export function TrackingAgentProvider({ children }: { children: React.ReactNode }) {
  useTrackingAgent();
  useOfflineSync();
  useTimerSync({ onFocus: true });
  useTrayMenu();
  useTrayTimerStatus();
  useConnectionMonitor();
  return (
    <>
      <ConnectionBanner />
      {children}
    </>
  );
}
