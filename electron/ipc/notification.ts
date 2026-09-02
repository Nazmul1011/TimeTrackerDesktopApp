/**
 * Notification IPC — show native OS notifications when enabled.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { NotificationService } from "../services/notifications";

export function registerNotificationIpc(): void {
  ipcMain.handle(
    "notification:show",
    async (
      _event,
      payload: { title?: string; body?: string; message?: string } | null,
    ) => {
      const title = payload?.title ?? "Gr8r Time Tracker";
      const body = payload?.body ?? payload?.message ?? "";
      const result = NotificationService.getInstance().show(title, body);
      log.info("[ipc:notification] show", result);
      return result;
    },
  );

  ipcMain.handle("notification:list", async () => {
    return NotificationService.getInstance().list();
  });
}
