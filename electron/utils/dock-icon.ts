/**
 * Keep the custom Dock icon applied. `electron:dev` runs stock Electron.app,
 * so macOS reverts to the host/window icon after show, focus, or bounce.
 */
import { app, nativeImage, type NativeImage } from "electron";
import log from "electron-log/main";
import { findExistingPath, resolveAppIconPaths } from "./index";

let cached: NativeImage | null = null;
let followUp: NodeJS.Timeout | null = null;

function loadIcon(): NativeImage | null {
  if (cached && !cached.isEmpty()) return cached;
  const iconPath = findExistingPath(resolveAppIconPaths());
  if (!iconPath) return null;
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return null;
  cached = image;
  return cached;
}

/** Apply the circular brand icon to the Dock. Call at launch / after bounce only — not on every focus. */
export function applyDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  // Packaged .app already has icon.icns / electron.icns. Runtime setIcon()
  // replaces that with a PNG NativeImage; macOS Dock then shows a generic cube.
  if (app.isPackaged) return;
  try {
    const image = loadIcon();
    if (!image) {
      log.warn("[dock] icon skipped — no icon file found");
      return;
    }
    app.dock.setIcon(image);
  } catch (error) {
    log.warn("[dock] setIcon failed", error);
  }
}

/**
 * Re-apply after Electron/macOS asynchronously replaces the custom icon.
 */
export function applyDockIconSoon(): void {
  applyDockIcon();
  if (followUp) clearTimeout(followUp);
  followUp = setTimeout(() => {
    followUp = null;
    applyDockIcon();
  }, 350);
}
