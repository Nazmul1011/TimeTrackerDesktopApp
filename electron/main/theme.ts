/**
 * Native theme — keeps Electron's own surfaces (window background before the
 * page paints, scrollbars, system dialogs) on the same Light / Dark / System
 * choice as the renderer.
 */
import { nativeTheme } from "electron";
import type { DesktopSettings } from "../services/settings";

const LIGHT_BACKGROUND = "#f9fafb";
/** The renderer's dark `--background` (hsl 222 47% 7%). */
const DARK_BACKGROUND = "#0a0f1a";

export function applyNativeTheme(theme: DesktopSettings["theme"]): void {
  if (nativeTheme.themeSource !== theme) nativeTheme.themeSource = theme;
}

export function windowBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}
