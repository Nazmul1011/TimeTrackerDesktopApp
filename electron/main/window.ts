/**
 * BrowserWindow factory.
 * Creates the main application window with context isolation enabled.
 */
import { app, BrowserWindow, shell } from "electron";
import path from "path";
import log from "electron-log/main";

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 446,
    height: 640,
    minWidth: 400,
    minHeight: 520,
    maxWidth: 520,
    show: false,
    title: "Gr8r Time Tracker",
    backgroundColor: "#f9fafb",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const isDev = !app.isPackaged;
  const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000";
  const startUrl = `${rendererUrl.replace(/\/$/, "")}/home`;

  if (isDev) {
    log.info(`[window] Loading renderer: ${startUrl}`);
    void win.loadURL(startUrl);
  } else {
    // Production: load Next.js export / local server path (placeholder)
    void win.loadURL(startUrl);
  }

  return win;
}
