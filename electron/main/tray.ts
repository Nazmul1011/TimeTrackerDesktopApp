/**
 * System tray scaffolding.
 * Icon and menu actions are placeholders — no business logic.
 */
import { Tray, Menu, BrowserWindow, nativeImage, app } from "electron";
import path from "path";
import log from "electron-log/main";

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray | null {
  try {
    const iconPath = path.join(
      app.isPackaged ? process.resourcesPath : path.join(__dirname, "../../resources"),
      "tray",
      "tray-icon.png",
    );

    const icon = nativeImage.createFromPath(iconPath);
    // Empty image is fine during scaffolding if the asset is missing
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip("Gr8r Time Tracker");

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show",
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
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
    tray.on("double-click", () => {
      mainWindow.show();
      mainWindow.focus();
    });

    log.info("[tray] Tray initialized");
    return tray;
  } catch (error) {
    log.warn("[tray] Failed to create tray (icon may be missing)", error);
    return null;
  }
}
