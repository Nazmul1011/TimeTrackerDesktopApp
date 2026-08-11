/**
 * Auto-updater scaffolding using electron-updater.
 * No update server logic yet — wires events only.
 */
import { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log/main";

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;

  autoUpdater.on("checking-for-update", () => {
    log.info("[updater] Checking for update…");
  });

  autoUpdater.on("update-available", (info) => {
    log.info("[updater] Update available", info.version);
    mainWindow.webContents.send("updater:available", info);
  });

  autoUpdater.on("update-not-available", () => {
    log.info("[updater] No update available");
  });

  autoUpdater.on("error", (err) => {
    log.error("[updater] Error", err);
  });

  // Intentionally not calling checkForUpdates() during scaffolding
  log.info("[updater] Auto-updater initialized (idle)");
}
