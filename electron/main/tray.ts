/**
 * System tray — platform-aware icons and show/quit.
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
      : process.platform === "darwin"
        ? [
            path.join(root, "tray", "tray-icon.png"),
            path.join(root, "icons", "icon.png"),
            path.join(root, "icons", "256x256.png"),
          ]
        : resolveAppIconPaths();

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

function showMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) {
    WindowRevealService.getInstance().revealNow();
    return;
  }
  WindowRevealService.getInstance().revealNow();
}

export function createTray(mainWindow: BrowserWindow): Tray | null {
  try {
    tray = new Tray(loadTrayIcon());
    tray.setToolTip("Gr8r Time Tracker");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Gr8r Time Tracker",
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
