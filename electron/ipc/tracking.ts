/**
 * Tracking IPC — start/stop main-process screenshot agent.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { TrackingService } from "../services/tracking";
import { MacPermissions } from "../services/mac-permissions";
import {
  idleResumeReasonSchema,
  nullToUndefined,
  parseIpcPayload,
  trackingAuthSchema,
  trackingStartSchema,
} from "../security/ipc-schemas";

export function registerTrackingIpc(): void {
  const tracking = TrackingService.getInstance();

  ipcMain.handle("tracking:start", async (_event, raw: unknown) => {
    const payload = parseIpcPayload("tracking:start", trackingStartSchema, raw);
    if (!payload) {
      return { ok: false, message: "Invalid tracking payload" };
    }
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
  });

  ipcMain.handle("tracking:stop", async () => {
    const result = tracking.stop();
    log.info("[ipc:tracking] stop");
    return result;
  });

  ipcMain.handle("tracking:updateAuth", async (_event, raw: unknown) => {
    const payload = parseIpcPayload("tracking:updateAuth", trackingAuthSchema, raw);
    if (!payload) {
      return { ok: false, message: "Invalid tracking auth" };
    }
    tracking.updateAuth(nullToUndefined(payload));
    return { ok: true };
  });

  ipcMain.handle("tracking:captureNow", async () => {
    return tracking.captureAndUpload();
  });

  ipcMain.handle("tracking:status", async () => {
    return { running: tracking.isRunning() };
  });

  ipcMain.handle("tracking:disarmIdleResume", async (_event, raw: unknown) => {
    const reason = parseIpcPayload("tracking:disarmIdleResume", idleResumeReasonSchema, raw);
    tracking.disarmIdleResume(reason ?? "window request");
    return { ok: true };
  });

  ipcMain.handle("tracking:armIdleResume", async (_event, raw: unknown) => {
    const reason = parseIpcPayload("tracking:armIdleResume", idleResumeReasonSchema, raw);
    return tracking.armIdleResume(reason ?? "window request");
  });

  ipcMain.handle("tracking:openScreenRecording", async () => {
    await MacPermissions.openScreenRecordingSettings();
    return { ok: true };
  });

  ipcMain.handle("tracking:retryScreenshots", async () => {
    return tracking.retryScreenshots();
  });
}
