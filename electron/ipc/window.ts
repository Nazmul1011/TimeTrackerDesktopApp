/**
 * Window IPC — auto-reveal after timer resume + tray status.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { WindowRevealService } from "../services/window-reveal";
import { setTrayTimerStatus, type TrayTimerStatus } from "../main/tray";
import { parseIpcPayload, revealSchema } from "../security/ipc-schemas";

function isTrayStatus(value: unknown): value is TrayTimerStatus {
  return value === "idle" || value === "running" || value === "paused";
}

export function registerWindowIpc(): void {
  ipcMain.handle("window:scheduleRevealAfterResume", async (_event, raw: unknown) => {
    const payload = parseIpcPayload("window:scheduleRevealAfterResume", revealSchema, raw);
    if (payload === null && raw != null) {
      return { ok: false, message: "Invalid reveal payload" };
    }
    const delayMs = payload?.delayMs ?? 5 * 60_000;
    WindowRevealService.getInstance().scheduleAfterResume(delayMs);
    log.info("[ipc:window] scheduleRevealAfterResume", { delayMs });
    return { ok: true };
  });

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
