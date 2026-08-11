/**
 * Settings IPC handlers — stubs only.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:get", async () => {
    log.info("[ipc:settings] get stub");
    return {};
  });

  ipcMain.handle("settings:set", async (_event, _payload) => {
    log.info("[ipc:settings] set stub");
    return { ok: true };
  });
}
