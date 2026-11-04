/**
 * Flushes the offline queue while the user is signed in, and closes a timer
 * that was still open when the app process last died.
 */
"use client";

import { useEffect, useRef } from "react";
import { flushOfflineQueue, recoverInterruptedSession } from "@/lib/offline-sync";
import { isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";

export function useOfflineSync() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const recoveredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;

    let stopped = false;
    const run = () => {
      if (!stopped) void flushOfflineQueue();
    };

    if (recoveredFor.current !== organizationId) {
      recoveredFor.current = organizationId;
      void recoverInterruptedSession().then(run);
    } else {
      run();
    }

    const id = window.setInterval(run, 15_000);
    window.addEventListener("online", run);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.removeEventListener("online", run);
    };
  }, [isAuthenticated, organizationId]);
}
