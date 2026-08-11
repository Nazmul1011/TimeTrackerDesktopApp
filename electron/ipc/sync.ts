/**
 * Sync IPC handlers — stubs only.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";

export function registerSyncIpc(): void {
  ipcMain.handle("sync:run", async () => {
    log.info("[ipc:sync] run stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("sync:getStatus", async () => {
    log.info("[ipc:sync] getStatus stub");
    return { status: "idle", lastSyncedAt: null };
  });
}
