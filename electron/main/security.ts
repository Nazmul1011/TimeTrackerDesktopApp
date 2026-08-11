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
      const allowed = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000";
      try {
        const parsed = new URL(navigationUrl);
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
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      // Allow display capture for screenshots; deny everything else by default
      if (
        permission === "media" ||
        permission === "display-capture" ||
        permission === "fullscreen"
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
