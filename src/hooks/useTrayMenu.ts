/**
 * Keeps the macOS menu-bar tray in sync and runs Pause / Stop / Sign Out from it.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/constants/routes";
import { signOutSession } from "@/lib/session";
import { pauseTimer, resumeTimer, stopTimer } from "@/lib/timer-actions";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export function useTrayMenu() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const timerStatus = useTimerStore((s) => s.timer.status);

  useEffect(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    void api?.tray?.setState?.({
      authenticated: isAuthenticated,
      timerStatus,
    });
  }, [isAuthenticated, timerStatus]);

  useEffect(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    if (!api?.tray?.onCommand) return;

    return api.tray.onCommand((payload) => {
      const action = payload?.action;
      if (action === "pause") {
        void pauseTimer();
        return;
      }
      if (action === "resume") {
        void resumeTimer();
        return;
      }
      if (action === "stop") {
        void stopTimer();
        return;
      }
      if (action === "stopAndQuit") {
        void (async () => {
          try {
            await stopTimer({ silent: true });
          } finally {
            const api = getElectronAPI();
            if (api?.app?.exit) {
              await api.app.exit();
            } else if (typeof window !== "undefined") {
              window.close();
            }
          }
        })();
        return;
      }
      if (action === "signOut") {
        void (async () => {
          await signOutSession();
          router.push(ROUTES.LOGIN);
        })();
      }
    });
  }, [router]);
}
