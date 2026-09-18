/**
 * Security defaults for the Electron main process.
 * Context isolation, navigation guards, and permission lockdown.
 */
import { app, session } from "electron";
import log from "electron-log/main";

export function applySecurityDefaults(): void {
  // Disable navigation to unexpected origins from the renderer
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
          return;
        }
        const allowed = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000";
        const allowedOrigin = new URL(allowed).origin;
        if (parsed.origin !== allowedOrigin && parsed.protocol !== "file:") {
          log.warn("[security] Blocked navigation to", navigationUrl);
          event.preventDefault();
        }
      } catch {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(() => ({ action: "deny" }));
  });

  app.whenReady().then(() => {
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      const name = String(permission);
      return (
        name === "media" ||
        name === "display-capture" ||
        name === "fullscreen" ||
        name === "notifications"
      );
    });

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      // Allow display capture for screenshots + OS notifications
      if (
        permission === "media" ||
        permission === "display-capture" ||
        permission === "fullscreen" ||
        permission === "notifications"
      ) {
        callback(true);
        return;
      }
      log.info("[security] Permission request denied:", permission);
      callback(false);
    });
  });

  log.info("[security] Security defaults applied");
}
