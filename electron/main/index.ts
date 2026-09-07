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
import { startRendererServer, stopRendererServer } from "./renderer-server";
import { registerIpcHandlers } from "../ipc";
import { initDatabase } from "../database/sqlite";
import { SettingsService } from "../services/settings";

loadEnv();

log.transports.file.level = "info";
log.info("[main] Starting Gr8r Time Tracker desktop client");

if (process.platform === "linux") {
  // Packaged Linux builds usually lack a setuid chrome-sandbox; without this
  // the process exits immediately when launched from the desktop menu.
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch(
    "enable-features",
    "WebRTCPipeWireCapturer,AllowSystemNotifications",
  );
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.gr8r.timetracker");
}

app.setName("Gr8r Time Tracker");

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

  if (app.isPackaged) {
    await startRendererServer();
  }

  initDatabase();
  registerIpcHandlers();
  SettingsService.getInstance().applyStoredLoginItem();

  mainWindow = createMainWindow();
  createAppMenu(mainWindow);
  createTray(mainWindow);
  initAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  void bootstrap().catch((err) => {
    log.error("[main] Bootstrap failed", err);
    app.quit();
  });

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
  stopRendererServer();
  log.info("[main] Application quitting");
});

// Help TypeScript / tooling resolve resources path in packaged builds
export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "resources")
  : path.join(__dirname, "../../resources");
