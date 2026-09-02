/**
 * Tracking IPC — start/stop main-process screenshot agent.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import {
  TrackingService,
  type TrackingAuth,
  type TrackingOptions,
} from "../services/tracking";

export function registerTrackingIpc(): void {
  const tracking = TrackingService.getInstance();

  ipcMain.handle(
    "tracking:start",
    async (
      _event,
      payload: TrackingAuth & Partial<TrackingOptions>,
    ) => {
      const {
        accessToken,
        refreshToken,
        organizationId,
        deviceId,
        sessionToken,
        apiBaseUrl,
        screenshotIntervalMs,
        enableScreenshots,
        firstScreenshotDelayMs,
        idleTimeoutMs,
      } = payload;

      if (!accessToken || !organizationId || !apiBaseUrl) {
        return { ok: false, message: "Missing tracking auth" };
      }

      const result = tracking.start(
        {
          accessToken,
          refreshToken,
          organizationId,
          deviceId: deviceId || "desktop",
          sessionToken,
          apiBaseUrl,
        },
        {
          screenshotIntervalMs,
          enableScreenshots,
          firstScreenshotDelayMs,
          idleTimeoutMs,
        },
      );
      log.info("[ipc:tracking] start", result);
      return result;
    },
  );

  ipcMain.handle("tracking:stop", async () => {
    const result = tracking.stop();
    log.info("[ipc:tracking] stop");
    return result;
  });

  ipcMain.handle(
    "tracking:updateAuth",
    async (_event, payload: Partial<TrackingAuth>) => {
      tracking.updateAuth(payload);
      return { ok: true };
    },
  );

  ipcMain.handle("tracking:captureNow", async () => {
    return tracking.captureAndUpload();
  });

  ipcMain.handle("tracking:status", async () => {
    return { running: tracking.isRunning() };
  });
}
