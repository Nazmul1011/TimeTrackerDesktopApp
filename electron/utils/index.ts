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
    return [
      path.join(root, "icons", "icon.icns"),
      path.join(root, "icons", "icon.png"),
      path.join(root, "icons", "256x256.png"),
      path.join(root, "tray", "tray-icon.png"),
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
