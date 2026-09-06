/**
 * Shared Electron path helpers.
 */
import { app } from "electron";
import fs from "fs";
import path from "path";

/** Root of shipped `resources/` (icons, tray, etc.). */
export function getResourcesRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(__dirname, "../../resources");
}

/** Prefer platform-native icon formats. */
export function resolveAppIconPaths(): string[] {
  const root = getResourcesRoot();
  if (process.platform === "win32") {
    return [
      path.join(root, "icons", "icon.ico"),
      path.join(root, "tray", "tray-icon.ico"),
      path.join(root, "icons", "icon.png"),
      path.join(root, "tray", "tray-icon.png"),
      path.join(root, "icons", "256x256.png"),
    ];
  }
  if (process.platform === "darwin") {
    // PNG first: nativeImage / dock.setIcon often fail to decode .icns.
    // icon.icns stays for electron-builder packaging only.
    return [
      path.join(root, "icons", "icon.png"),
      path.join(root, "icons", "256x256.png"),
      path.join(root, "tray", "tray-icon.png"),
      path.join(root, "icons", "icon.icns"),
    ];
  }
  return [
    path.join(root, "tray", "tray-icon.png"),
    path.join(root, "icons", "icon.png"),
    path.join(root, "icons", "256x256.png"),
    path.join(root, "icons", "icon.ico"),
  ];
}

export function findExistingPath(candidates: string[]): string | undefined {
  return candidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch {
      return false;
    }
  });
}

export function noop(): void {
  // placeholder
}
