/**
 * Native OS notifications (gated by Settings → Enable notifications).
 * Shown from the main process so alerts appear even when the app window is hidden.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { app, BrowserWindow, nativeImage, Notification } from "electron";
import log from "electron-log/main";
import { SettingsService } from "../settings";
import { WindowRevealService } from "../window-reveal";

const execFileAsync = promisify(execFile);

export class NotificationService {
  private static instance: NotificationService | null = null;

  /** Keep references until closed — otherwise GC prevents Linux notifications. */
  private active: Notification[] = [];

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /** Desktop alert when idle auto-pause stops the timer. */
  showTimerIdlePaused(idleMinutes: number): { ok: boolean; message?: string } {
    const minutes = Math.max(1, Math.round(idleMinutes));
    const minuteLabel = minutes === 1 ? "minute" : "minutes";
    return this.show(
      "Timer paused",
      `No mouse or keyboard activity for ${minutes} ${minuteLabel}. Your timer has been paused.`,
      { urgency: "critical" },
    );
  }

  show(
    title: string,
    body: string,
    options?: { urgency?: "normal" | "critical" | "low" },
  ): { ok: boolean; message?: string } {
    if (!SettingsService.getInstance().notificationsEnabled()) {
      log.info("[NotificationService] skipped — notifications disabled in settings");
      return { ok: false, message: "Notifications disabled in settings" };
    }

    const safeTitle = title || "Gr8r Time Tracker";
    const safeBody = body || "";

    if (Notification.isSupported()) {
      const electronResult = this.showElectron(safeTitle, safeBody, options);
      if (electronResult.ok) return electronResult;
      log.warn(
        "[NotificationService] Electron notification failed, trying fallback",
        electronResult.message,
      );
    }

    if (process.platform === "linux") {
      void this.showLinuxNotifySend(safeTitle, safeBody, options?.urgency);
      return { ok: true };
    }

    log.warn("[NotificationService] not supported on this platform");
    return { ok: false, message: "Notifications not supported" };
  }

  private showElectron(
    title: string,
    body: string,
    options?: { urgency?: "normal" | "critical" | "low" },
  ): { ok: boolean; message?: string } {
    try {
      const icon = this.resolveIcon();
      const notification = new Notification({
        title,
        body,
        silent: false,
        ...(icon ? { icon } : {}),
        ...(process.platform === "linux" && options?.urgency
          ? { urgency: options.urgency }
          : {}),
      });

      this.active.push(notification);

      const cleanup = () => {
        this.active = this.active.filter((n) => n !== notification);
      };

      notification.on("click", () => {
        WindowRevealService.getInstance().revealNow();
        cleanup();
      });
      notification.on("close", cleanup);
      notification.on("failed", (_event, error) => {
        log.warn("[NotificationService] notification failed event", error);
        cleanup();
        void this.showLinuxNotifySend(title, body, options?.urgency);
      });

      notification.show();
      log.info("[NotificationService] shown via Electron", { title, body });
      return { ok: true };
    } catch (error) {
      log.warn("[NotificationService] showElectron failed", error);
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to show notification",
      };
    }
  }

  private async showLinuxNotifySend(
    title: string,
    body: string,
    urgency: "normal" | "critical" | "low" = "critical",
  ): Promise<boolean> {
    try {
      const args = ["-a", "Gr8r Time Tracker"];
      const icon = this.resolveIconPath();
      if (icon) args.push("-i", icon);
      args.push("-u", urgency, title, body);
      await execFileAsync("notify-send", args);
      log.info("[NotificationService] shown via notify-send", { title, body });
      return true;
    } catch (error) {
      log.warn("[NotificationService] notify-send failed", error);
      return false;
    }
  }

  private resolveIconPath(): string | undefined {
    const resourcesRoot = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, "../../../resources");

    const candidates = [
      path.join(resourcesRoot, "tray", "tray-icon.png"),
      path.join(resourcesRoot, "icons", "icon.png"),
      path.join(resourcesRoot, "icons", "512x512.png"),
    ];

    return candidates.find((candidate) => fs.existsSync(candidate));
  }

  private resolveIcon(): string | Electron.NativeImage | undefined {
    const png = this.resolveIconPath();
    if (png) return png;

    const logoSvg = path.join(app.getAppPath(), "public", "figma", "logo.svg");
    if (fs.existsSync(logoSvg)) {
      const image = nativeImage.createFromPath(logoSvg);
      if (!image.isEmpty()) return image;
    }

    return undefined;
  }

  list(): unknown[] {
    return [];
  }
}
