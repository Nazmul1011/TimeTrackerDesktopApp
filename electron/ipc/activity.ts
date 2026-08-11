/**
 * Activity IPC — returns live idle + active window samples.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { ActivityService } from "../services/activity";
import { IdleService } from "../services/idle";

export function registerActivityIpc(): void {
  const activity = ActivityService.getInstance();
  const idle = IdleService.getInstance();

  ipcMain.handle("activity:getIdleState", async (_event, thresholdSeconds?: number) => {
    return idle.getIdleState(
      typeof thresholdSeconds === "number" ? thresholdSeconds : 180,
    );
  });

  ipcMain.handle("activity:getActiveWindow", async () => {
    return activity.getActiveWindow();
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
