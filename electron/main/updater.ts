/**
 * Auto-updater using electron-updater.
 * Checks GitHub Releases on startup and every 2 hours.
 * Downloads silently and prompts/applies on quit or install.
 */
import { BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log/main";

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

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

  autoUpdater.on("download-progress", (progress) => {
    log.info(`[updater] Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    log.info("[updater] Update downloaded", info.version);
    mainWindow.webContents.send("updater:downloaded", info);
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on("error", (err) => {
    log.error("[updater] Error", err);
  });

  // Check on startup after 10s (app finishes loading first)
  setTimeout(() => {
    void autoUpdater.checkForUpdatesAndNotify();
  }, 10_000);

  // Re-check every 2 hours
  setInterval(
    () => {
      void autoUpdater.checkForUpdatesAndNotify();
    },
    2 * 60 * 60 * 1_000,
  );

  log.info("[updater] Auto-updater initialized");
}
