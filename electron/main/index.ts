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
import { SettingsService } from "../services/settings";
import { WindowRevealService } from "../services/window-reveal";

loadEnv();

log.transports.file.level = "info";
log.info("[main] Starting Gr8r Time Tracker desktop client");

if (process.platform === "linux") {
  app.commandLine.appendSwitch(
    "enable-features",
    "WebRTCPipeWireCapturer,AllowSystemNotifications",
  );
}

// Must be set before ready — required for Windows toast notifications.
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
    WindowRevealService.getInstance().revealNow();
  });
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

async function bootstrap(): Promise<void> {
  applySecurityDefaults();
  initDatabase();
  registerIpcHandlers();
  SettingsService.getInstance().applyStoredLoginItem();

  mainWindow = createMainWindow();

  // Keep tracking alive when the user closes the window — hide to tray instead.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow?.hide();
    log.info("[main] window hidden to tray (tracking continues)");
  });

  createAppMenu(mainWindow);
  createTray(mainWindow);
  initAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  void bootstrap();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    } else {
      WindowRevealService.getInstance().revealNow();
    }
  });
});

app.on("window-all-closed", () => {
  // Window is hidden to tray, not destroyed — do not quit here.
});

app.on("before-quit", () => {
  isQuitting = true;
  log.info("[main] Application quitting");
});

// Help TypeScript / tooling resolve resources path in packaged builds
export const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "resources")
  : path.join(__dirname, "../../resources");
