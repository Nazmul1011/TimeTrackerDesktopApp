/**
 * Window IPC — auto-reveal after timer resume + tray status.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { WindowRevealService } from "../services/window-reveal";
import { setTrayTimerStatus, type TrayTimerStatus } from "../main/tray";

function isTrayStatus(value: unknown): value is TrayTimerStatus {
  return value === "idle" || value === "running" || value === "paused";
}

export function registerWindowIpc(): void {
  ipcMain.handle(
    "window:scheduleRevealAfterResume",
    async (_event, payload: { delayMs?: number } | null) => {
      const delayMs = payload?.delayMs ?? 5 * 60_000;
      WindowRevealService.getInstance().scheduleAfterResume(delayMs);
      log.info("[ipc:window] scheduleRevealAfterResume", { delayMs });
      return { ok: true };
    },
  );

  ipcMain.handle("window:cancelReveal", async () => {
    WindowRevealService.getInstance().cancel();
    return { ok: true };
  });

  ipcMain.handle("window:revealNow", async () => {
    WindowRevealService.getInstance().revealNow();
    log.info("[ipc:window] revealNow");
    return { ok: true };
  });

  ipcMain.handle("window:setTimerStatus", async (_event, status: unknown) => {
    if (!isTrayStatus(status)) {
      return { ok: false, message: "Invalid timer status" };
    }
    setTrayTimerStatus(status);
    return { ok: true };
  });
}
