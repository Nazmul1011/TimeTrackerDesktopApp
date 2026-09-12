/**
 * Auth IPC — persist session in electron-store so Quit keeps the user signed in.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { StorageService, type PersistedAuthSession } from "../services/storage";

function isSessionPayload(value: unknown): value is PersistedAuthSession {
  return Boolean(value) && typeof value === "object";
}

export function registerAuthIpc(): void {
  ipcMain.handle("auth:getSession", async () => {
    const session = StorageService.getInstance().getAuthSession();
    log.info(
      `[ipc:auth] getSession → ${session?.accessToken || session?.refreshToken ? "found" : "empty"}`,
    );
    return session;
  });

  ipcMain.handle("auth:saveSession", async (_event, payload: unknown) => {
    if (!isSessionPayload(payload)) {
      return { ok: false, message: "Invalid session payload" };
    }
    StorageService.getInstance().setAuthSession({
      accessToken: payload.accessToken ?? null,
      refreshToken: payload.refreshToken ?? null,
      sessionToken: payload.sessionToken ?? null,
      organizationId: payload.organizationId ?? null,
      user: payload.user ?? null,
      organizations: Array.isArray(payload.organizations) ? payload.organizations : null,
    });
    return { ok: true };
  });

  ipcMain.handle("auth:logout", async () => {
    StorageService.getInstance().clearAuthSession();
    log.info("[ipc:auth] logout — cleared persisted session");
    return { ok: true };
  });
}
