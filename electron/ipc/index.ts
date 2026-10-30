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

export function registerIpcHandlers(): void {
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
