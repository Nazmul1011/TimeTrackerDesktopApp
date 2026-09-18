/**
 * BrowserWindow factory.
 * Creates the main application window with context isolation enabled.
 */
import { app, BrowserWindow, nativeImage, shell } from "electron";
import path from "path";
import log from "electron-log/main";
import { findExistingPath, resolveAppIconPaths } from "../utils";
import { startRendererServer } from "./renderer-server";

async function waitForRenderer(url: string, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any HTTP response means Next is up (including 307/401).
      if (res.status > 0) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Renderer not reachable: ${url}`);
}

export function createMainWindow(): BrowserWindow {
  const iconPath = findExistingPath(resolveAppIconPaths());
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined;

  const win = new BrowserWindow({
    width: 446,
    height: 640,
    minWidth: 446,
    minHeight: 640,
    maxWidth: 446,
    maxHeight: 640,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: "Gr8r Time Tracker",
    backgroundColor: "#f9fafb",
    autoHideMenuBar: true,
    // On macOS the window icon is flattened onto white and replaces dock.setIcon.
    ...(process.platform !== "darwin" && icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  const reveal = () => {
    if (win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  };

  win.once("ready-to-show", reveal);

  // Safety net — never leave a hidden window if ready-to-show never fires
  setTimeout(reveal, 4000);

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const isDev = !app.isPackaged;

  void (async () => {
    try {
      let startUrl: string;
      if (isDev) {
        const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000";
        startUrl = `${rendererUrl.replace(/\/$/, "")}/home`;
        log.info(`[window] Waiting for renderer: ${startUrl}`);
        await waitForRenderer(startUrl);
      } else {
        const { port } = await startRendererServer();
        startUrl = `http://127.0.0.1:${port}/home/`;
      }
      log.info(`[window] Loading renderer: ${startUrl}`);
      await win.loadURL(startUrl);
      reveal();
    } catch (err) {
      log.error("[window] Failed to load renderer", err);
      reveal();
    }
  })();

  return win;
}
