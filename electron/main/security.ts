/**
 * Security defaults for the Electron main process.
 * Context isolation, navigation guards, and permission lockdown.
 */
import { app, session } from "electron";
import log from "electron-log/main";

function isAllowedRendererOrigin(origin: string): boolean {
  const configured = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000";
  try {
    if (origin === new URL(configured).origin) return true;
  } catch {
    // ignore bad configured URL
  }
  // Packaged local static server + Next dev defaults
  return (
    origin === "http://127.0.0.1:3000" ||
    origin === "http://localhost:3000" ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  );
}

export function applySecurityDefaults(): void {
  // Disable navigation to unexpected origins from the renderer
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, navigationUrl) => {
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.protocol === "file:") return;
        if (!isAllowedRendererOrigin(parsed.origin)) {
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
        name === "fullscreen"
      );
    });

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
