/**
 * Auth IPC handlers — stubs only.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";

export function registerAuthIpc(): void {
  ipcMain.handle("auth:login", async (_event, _payload) => {
    log.info("[ipc:auth] login stub");
    return { ok: false, message: "Not implemented" };
  });

  ipcMain.handle("auth:logout", async () => {
    log.info("[ipc:auth] logout stub");
    return { ok: true };
  });

  ipcMain.handle("auth:getSession", async () => {
    log.info("[ipc:auth] getSession stub");
    return null;
  });
}
