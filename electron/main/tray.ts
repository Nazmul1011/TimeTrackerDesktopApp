/**
 * System tray — show/quit + Windows-friendly icon (.ico).
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from "electron";
import path from "path";
import log from "electron-log/main";
import {
  findExistingPath,
  getResourcesRoot,
  resolveAppIconPaths,
} from "../utils";
import { WindowRevealService } from "../services/window-reveal";

let tray: Tray | null = null;

function loadTrayIcon(): Electron.NativeImage {
  const root = getResourcesRoot();
  const candidates =
    process.platform === "win32"
      ? [
          path.join(root, "tray", "tray-icon.ico"),
          path.join(root, "icons", "icon.ico"),
          path.join(root, "tray", "tray-icon.png"),
          path.join(root, "icons", "icon.png"),
        ]
      : resolveAppIconPaths();

  const iconPath = findExistingPath(candidates);
  if (iconPath) {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return process.platform === "win32" ? icon.resize({ width: 16, height: 16 }) : icon;
    }
  }

  log.warn("[tray] icon asset missing — using empty image");
  return nativeImage.createEmpty();
}

function showMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) {
    WindowRevealService.getInstance().revealNow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === "win32") {
    try {
      mainWindow.moveTop();
    } catch {
      // ignore
    }
  }
}

export function createTray(mainWindow: BrowserWindow): Tray | null {
  try {
    tray = new Tray(loadTrayIcon());
    tray.setToolTip("Gr8r Time Tracker");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show",
        click: () => showMainWindow(mainWindow),
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on("double-click", () => showMainWindow(mainWindow));
    tray.on("click", () => {
      if (process.platform === "win32") showMainWindow(mainWindow);
    });

    log.info("[tray] Tray initialized");
    return tray;
  } catch (error) {
    log.warn("[tray] Failed to create tray (icon may be missing)", error);
    return null;
  }
}
