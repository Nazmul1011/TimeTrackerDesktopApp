/**
 * Window IPC — show the window on request + tray status.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { WindowRevealService } from "../services/window-reveal";
import { setTrayTimerStatus, type TrayTimerStatus } from "../main/tray";

function isTrayStatus(value: unknown): value is TrayTimerStatus {
  return value === "idle" || value === "running" || value === "paused";
}

export function registerWindowIpc(): void {
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
