/**
 * Brings the main window to the front after the timer is resumed.
 */
import { app, BrowserWindow } from "electron";
import log from "electron-log/main";

export class WindowRevealService {
  private static instance: WindowRevealService | null = null;

  private revealTimer: NodeJS.Timeout | null = null;

  static getInstance(): WindowRevealService {
    if (!WindowRevealService.instance) {
      WindowRevealService.instance = new WindowRevealService();
    }
    return WindowRevealService.instance;
  }

  /** Schedule a one-shot reveal after resume (e.g. after idle auto-pause). */
  scheduleAfterResume(delayMs: number): void {
    this.cancel();
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;

    log.info(
      `[WindowRevealService] scheduled reveal in ${Math.round(delayMs / 1000)}s`,
    );

    this.revealTimer = setTimeout(() => {
      this.revealTimer = null;
      this.revealNow();
    }, delayMs);
  }

  cancel(): void {
    if (this.revealTimer) {
      clearTimeout(this.revealTimer);
      this.revealTimer = null;
    }
  }

  /** Immediately show and focus the main window (platform-aware). */
  revealNow(): void {
    const win = this.getMainWindow();
    if (!win) {
      log.warn("[WindowRevealService] no window to reveal");
      return;
    }

    if (process.platform === "win32") {
      this.revealWindows(win);
    } else {
      this.revealUnix(win);
    }

    log.info("[WindowRevealService] revealed main window");
  }

  private revealWindows(win: BrowserWindow): void {
    if (win.isMinimized()) win.restore();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    try {
      win.moveTop();
    } catch {
      // moveTop may be unavailable on some Electron builds
    }
    win.flashFrame(true);

    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.setAlwaysOnTop(false);
      win.flashFrame(false);
      win.focus();
    }, 1200);
  }

  private revealUnix(win: BrowserWindow): void {
    if (win.isMinimized()) win.restore();
    win.show();
    win.setVisibleOnAllWorkspaces(true);
    win.setAlwaysOnTop(true, "screen-saver");
    win.focus();

    try {
      app.focus({ steal: true });
    } catch {
      app.focus();
    }

    setTimeout(() => {
      if (win.isDestroyed()) return;
      win.setAlwaysOnTop(false);
      win.setVisibleOnAllWorkspaces(false);
      win.focus();
    }, 800);
  }

  private getMainWindow(): BrowserWindow | undefined {
    return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
  }
}
