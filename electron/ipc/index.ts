/**
 * IPC handler registry.
 * Registers all domain IPC modules. Handlers are empty stubs.
 */
import log from "electron-log/main";
import { registerAuthIpc } from "./auth";
import { registerTimerIpc } from "./timer";
import { registerScreenshotIpc } from "./screenshot";
import { registerActivityIpc } from "./activity";
import { registerNotificationIpc } from "./notification";
import { registerSettingsIpc } from "./settings";
import { registerSyncIpc } from "./sync";
import { registerTrackingIpc } from "./tracking";
import { registerWindowIpc } from "./window";
import { registerTrayIpc } from "../main/tray";
import { installIpcSenderGuard } from "../security/ipc-sender-guard";
import { getRendererOrigin } from "../main/renderer-origin";

export function registerIpcHandlers(): void {
  // Must run before any ipcMain.handle so every handler checks its sender.
  installIpcSenderGuard(getRendererOrigin);
  registerAuthIpc();
  registerTimerIpc();
  registerScreenshotIpc();
  registerActivityIpc();
  registerNotificationIpc();
  registerSettingsIpc();
  registerSyncIpc();
  registerTrackingIpc();
  registerWindowIpc();
  registerTrayIpc();
  log.info("[ipc] All IPC handlers registered");
}
