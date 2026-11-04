/**
 * Rejects IPC calls from frames that are not our renderer (Electron security
 * checklist: validate the sender of all IPC messages).
 *
 * Trusted: the renderer origin, and loopback hosts (dev server on localhost,
 * packaged static server on 127.0.0.1 with a random port).
 * A frame with no URL yet (still loading) is allowed so startup never breaks.
 */
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import log from "electron-log/main";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isTrustedSenderUrl(
  senderUrl: string | null | undefined,
  rendererOrigin: string,
): boolean {
  if (!senderUrl) return true;
  try {
    const url = new URL(senderUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (LOOPBACK.has(url.hostname)) return true;
    return url.origin === new URL(rendererOrigin).origin;
  } catch {
    return false;
  }
}

let installed = false;

/** Wraps ipcMain.handle so every handler registered afterwards checks its sender. */
export function installIpcSenderGuard(getRendererOrigin: () => string): void {
  if (installed) return;
  installed = true;

  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    originalHandle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url;
      if (!isTrustedSenderUrl(senderUrl, getRendererOrigin())) {
        log.warn(`[security] blocked IPC "${channel}" from untrusted sender ${senderUrl}`);
        throw new Error("Untrusted IPC sender");
      }
      return listener(event, ...args);
    });
}
