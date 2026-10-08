/**
 * System tray — show window, timer controls, sign out, quit.
 */
import { Tray, Menu, BrowserWindow, nativeImage, app, ipcMain } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import path from "path";
import log from "electron-log/main";
import { findExistingPath, getResourcesRoot, resolveAppIconPaths } from "../utils";
import { WindowRevealService } from "../services/window-reveal";
import { applyTimerStatusIcon } from "../utils/dock-icon";

type TrayTimerStatus = "idle" | "running" | "paused";

type TrayUiState = {
  authenticated: boolean;
  timerStatus: TrayTimerStatus;
};

type TrayCommand = "pause" | "resume" | "stop" | "signOut" | "stopAndQuit";

let tray: Tray | null = null;
let mainWindowRef: BrowserWindow | null = null;
const trayState: TrayUiState = {
  authenticated: false,
  timerStatus: "idle",
};

/** Brand icon while tracking; red when paused or stopped so it can't be mistaken for running. */
function trayIconName(): string {
  return trayState.authenticated && trayState.timerStatus === "running"
    ? "tray-icon"
    : "tray-icon-red";
}

function loadTrayIcon(name: string): Electron.NativeImage {
  const root = getResourcesRoot();
  const candidates =
    process.platform === "win32"
      ? [
          path.join(root, "tray", `${name}.ico`),
          path.join(root, "icons", "icon.ico"),
          path.join(root, "tray", `${name}.png`),
          path.join(root, "icons", "icon.png"),
        ]
      : process.platform === "darwin"
        ? [
            path.join(root, "tray", `${name}.png`),
            path.join(root, "icons", "icon.png"),
            path.join(root, "icons", "256x256.png"),
          ]
        : [path.join(root, "tray", `${name}.png`), ...resolveAppIconPaths()];

  const iconPath = findExistingPath(candidates);
  if (iconPath) {
    let icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      if (process.platform === "win32") {
        icon = icon.resize({ width: 16, height: 16 });
      } else if (process.platform === "darwin") {
        // Colored brand icon — do NOT mark as template (template needs monochrome).
        icon = icon.resize({ width: 22, height: 22 });
      }
      return icon;
    }
  }

  log.warn("[tray] icon asset missing — using empty image");
  return nativeImage.createEmpty();
}

let shownIconName: string | null = null;

function refreshTrayIcon(): void {
  if (!tray) return;
  const name = trayIconName();
  if (name === shownIconName) return;
  const icon = loadTrayIcon(name);
  if (icon.isEmpty()) return;
  tray.setImage(icon);
  shownIconName = name;
}

function showMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) {
    WindowRevealService.getInstance().revealNow({ force: true });
    return;
  }
  WindowRevealService.getInstance().revealNow({ force: true });
}

function targetWindow(): BrowserWindow | undefined {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) return mainWindowRef;
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
}

function sendCommand(action: TrayCommand): void {
  const win = targetWindow();
  if (!win) {
    log.warn("[tray] no window for command", action);
    return;
  }
  win.webContents.send("tray:command", { action });
}

function rebuildMenu(): void {
  if (!tray) return;
  const win = targetWindow();
  const running = trayState.authenticated && trayState.timerStatus === "running";
  const paused = trayState.authenticated && trayState.timerStatus === "paused";
  const canStop = running || paused;

  const template: MenuItemConstructorOptions[] = [
    {
      label: "Show Gr8r Time Tracker",
      click: () => {
        if (win) showMainWindow(win);
      },
    },
    { type: "separator" },
    paused
      ? {
          label: "Resume Timer",
          enabled: true,
          click: () => sendCommand("resume"),
        }
      : {
          label: "Pause Timer",
          enabled: running,
          click: () => sendCommand("pause"),
        },
    {
      label: "Stop Timer",
      enabled: canStop,
      click: () => sendCommand("stop"),
    },
    { type: "separator" },
    {
      label: "Sign Out",
      enabled: trayState.authenticated,
      click: () => sendCommand("signOut"),
    },
    {
      label: "Quit",
      click: () => {
        if (trayState.timerStatus === "running" || trayState.timerStatus === "paused") {
          sendCommand("stopAndQuit");
        } else {
          app.quit();
        }
      },
    },
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

export function updateTrayState(partial: Partial<TrayUiState>): void {
  if (
    typeof partial.authenticated === "boolean" &&
    partial.authenticated !== trayState.authenticated
  ) {
    trayState.authenticated = partial.authenticated;
  }
  if (
    partial.timerStatus === "idle" ||
    partial.timerStatus === "running" ||
    partial.timerStatus === "paused"
  ) {
    trayState.timerStatus = partial.timerStatus;
  }
  refreshTrayIcon();
  applyTimerStatusIcon(trayState.authenticated ? trayState.timerStatus : "idle", targetWindow());
  rebuildMenu();
}

export function registerTrayIpc(): void {
  ipcMain.handle("tray:setState", (_event, payload: Partial<TrayUiState> | null) => {
    if (payload && typeof payload === "object") {
      updateTrayState(payload);
    }
    return { ok: true };
  });
  ipcMain.handle("app:exit", () => {
    app.exit(0);
  });
}

export function createTray(mainWindow: BrowserWindow): Tray | null {
  try {
    mainWindowRef = mainWindow;
    shownIconName = trayIconName();
    tray = new Tray(loadTrayIcon(shownIconName));
    tray.setToolTip("Gr8r Time Tracker");
    rebuildMenu();

    tray.on("double-click", () => showMainWindow(mainWindow));
    tray.on("click", () => {
      // Windows & Linux: click shows. macOS: click opens context menu by default.
      if (process.platform !== "darwin") showMainWindow(mainWindow);
    });

    log.info("[tray] Tray initialized");
    return tray;
  } catch (error) {
    log.warn("[tray] Failed to create tray (icon may be missing)", error);
    return null;
  }
}
