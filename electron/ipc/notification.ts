/**
 * Notification IPC handlers — stubs only.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";

export function registerNotificationIpc(): void {
  ipcMain.handle("notification:show", async (_event, _payload) => {
    log.info("[ipc:notification] show stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("notification:list", async () => {
    log.info("[ipc:notification] list stub");
    return [];
  });
}
