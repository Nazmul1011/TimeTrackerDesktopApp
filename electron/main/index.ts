/**
 * Electron main process entry.
 * Bootstraps logging, security, database, IPC, window, tray, and updater.
 * No business logic — scaffolding only.
 */
import { app, BrowserWindow } from "electron";
import log from "electron-log/main";
import { config as loadEnv } from "dotenv";
import path from "path";

import { createMainWindow } from "./window";
import { createTray } from "./tray";
import { createAppMenu } from "./menu";
import { initAutoUpdater } from "./updater";
import { applySecurityDefaults } from "./security";
import { registerIpcHandlers } from "../ipc";
import { initDatabase } from "../database/sqlite";

loadEnv();

log.transports.file.level = "info";
log.info("[main] Starting Gr8r Time Tracker desktop client");

if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
}

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  applySecurityDefaults();
  initDatabase();
  registerIpcHandlers();

  mainWindow = createMainWindow();
  createAppMenu(mainWindow);
  createTray(mainWindow);
  initAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  void bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  log.info("[main] Application quitting");
});

// Help TypeScript / tooling resolve resources path in packaged builds
export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "resources")
  : path.join(__dirname, "../../resources");
