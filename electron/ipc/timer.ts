/**
 * Timer IPC handlers — stubs only.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";

export function registerTimerIpc(): void {
  ipcMain.handle("timer:start", async (_event, _payload) => {
    log.info("[ipc:timer] start stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("timer:stop", async () => {
    log.info("[ipc:timer] stop stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("timer:pause", async () => {
    log.info("[ipc:timer] pause stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("timer:resume", async () => {
    log.info("[ipc:timer] resume stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("timer:getStatus", async () => {
    log.info("[ipc:timer] getStatus stub");
    return { status: "idle", elapsedMs: 0 };
  });
}
