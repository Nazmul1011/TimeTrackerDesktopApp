/**
 * Auth IPC — persist session in electron-store so login survives restarts.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import {
  StorageService,
  type PersistedAuthSession,
} from "../services/storage";

function isSessionPayload(value: unknown): value is PersistedAuthSession {
  return Boolean(value) && typeof value === "object";
}

export function registerAuthIpc(): void {
  ipcMain.handle("auth:login", async () => {
    return { ok: false, message: "Use renderer login" };
  });
  ipcMain.handle("auth:getSession", async () => {
    const session = StorageService.getInstance().getAuthSession();
    const hasSession = Boolean(session.refreshToken || session.accessToken);
    log.info("[ipc:auth] getSession", { hasSession });
    return hasSession ? session : null;
  });

  ipcMain.handle("auth:saveSession", async (_event, payload: unknown) => {
    if (!isSessionPayload(payload)) {
      return { ok: false, message: "Invalid session payload" };
    }
    StorageService.getInstance().setAuthSession(payload);
    log.info("[ipc:auth] saveSession", {
      hasAccessToken: Boolean(payload.accessToken),
      hasRefreshToken: Boolean(payload.refreshToken),
      hasOrg: Boolean(payload.organizationId),
    });
    return { ok: true };
  });

  ipcMain.handle("auth:logout", async () => {
    StorageService.getInstance().clearAuthSession();
    log.info("[ipc:auth] logout — persisted session cleared");
    return { ok: true };
  });
}
