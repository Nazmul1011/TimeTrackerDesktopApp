/**
 * Activity IPC — returns live idle + active window samples + app icons.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { ActivityService } from "../services/activity";
import { AppIconService } from "../services/app-icon";
import { IdleService } from "../services/idle";

export function registerActivityIpc(): void {
  const activity = ActivityService.getInstance();
  const idle = IdleService.getInstance();
  const icons = AppIconService.getInstance();

  ipcMain.handle("activity:getIdleState", async (_event, thresholdSeconds?: number) => {
    return idle.getIdleState(typeof thresholdSeconds === "number" ? thresholdSeconds : 120);
  });

  ipcMain.handle("activity:getActiveWindow", async () => {
    const win = await activity.getActiveWindow();
    if (win.appName && win.bundlePath) {
      void icons.rememberFromBundlePath(win.appName, win.bundlePath);
    } else if (win.appName) {
      void icons.getIconDataUrl(win.appName);
    }
    return win;
  });

  ipcMain.handle("activity:getAppIcon", async (_event, appName?: string) => {
    if (typeof appName !== "string" || !appName.trim()) return null;
    return icons.getIconDataUrl(appName);
  });

  ipcMain.handle("activity:getAppIcons", async (_event, appNames?: unknown) => {
    if (!Array.isArray(appNames)) return {};
    const names = appNames.filter((n): n is string => typeof n === "string");
    return icons.getIconsDataUrl(names);
  });

  ipcMain.handle("activity:getSummary", async () => {
    log.info("[ipc:activity] getSummary stub");
    return { activeMs: 0, idleMs: 0 };
  });

  ipcMain.handle("activity:start", async () => {
    activity.start();
    return { ok: true };
  });

  ipcMain.handle("activity:stop", async () => {
    activity.stop();
    return { ok: true };
  });
}
