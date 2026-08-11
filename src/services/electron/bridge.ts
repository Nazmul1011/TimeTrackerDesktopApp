/**
 * Electron bridge helpers for the renderer.
 * Safely accesses window.electronAPI when running inside Electron.
 */

export type ElectronAPI = NonNullable<Window["electronAPI"]>;

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === "undefined") return null;
  return window.electronAPI ?? null;
}

export function isElectron(): boolean {
  return getElectronAPI() !== null;
}
