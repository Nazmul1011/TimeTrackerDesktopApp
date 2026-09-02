/**
 * Settings IPC — get/set desktop preferences (theme, login, notifications).
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import {
  SettingsService,
  type DesktopSettings,
} from "../services/settings";

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:get", async () => {
    const settings = SettingsService.getInstance().get();
    log.info("[ipc:settings] get", settings);
    return settings;
  });

  ipcMain.handle(
    "settings:set",
    async (_event, payload: Partial<DesktopSettings> | null) => {
      const result = SettingsService.getInstance().set(payload ?? {});
      if (!result.ok) {
        log.warn("[ipc:settings] set failed", result.message);
      } else {
        log.info("[ipc:settings] set ok", result.settings);
      }
      return result;
    },
  );
}
