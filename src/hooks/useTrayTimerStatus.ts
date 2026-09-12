/**
 * Keep the system tray logo in sync with timer status (red while paused).
 */
"use client";

import { useEffect } from "react";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useTimerStore } from "@/store/timer.store";

export function useTrayTimerStatus() {
  const status = useTimerStore((s) => s.timer.status);

  useEffect(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    if (!api?.window?.setTimerStatus) return;
    void api.window.setTimerStatus(status);
  }, [status]);
}
