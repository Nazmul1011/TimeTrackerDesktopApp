/**
 * Screenshot IPC — captures JPEG bytes in main and returns base64 to renderer.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { ScreenshotService } from "../services/screenshots";

export function registerScreenshotIpc(): void {
  const screenshots = ScreenshotService.getInstance();

  ipcMain.handle("screenshot:capture", async () => {
    const shot = await screenshots.capture();
    if (!shot) {
      return { ok: false, message: "Capture failed" };
    }
    log.info("[ipc:screenshot] captured", shot.width, "x", shot.height, shot.mimeType);
    return {
      ok: true,
      capturedAt: shot.capturedAt,
      width: shot.width,
      height: shot.height,
      mimeType: shot.mimeType,
      base64: shot.buffer.toString("base64"),
    };
  });

  ipcMain.handle("screenshot:list", async () => {
    return screenshots.list();
  });
}
