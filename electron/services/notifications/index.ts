/**
 * Native OS notifications (gated by Settings → Enable notifications).
 * Shown from the main process so alerts appear even when the app window is hidden.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { app, nativeImage, Notification } from "electron";
import log from "electron-log/main";
import { SettingsService } from "../settings";
import { WindowRevealService } from "../window-reveal";
import { findExistingPath, getResourcesRoot, resolveAppIconPaths } from "../../utils";

const execFileAsync = promisify(execFile);

export class NotificationService {
  private static instance: NotificationService | null = null;

  /** Keep references until closed — otherwise GC can drop the toast. */
  private active: Notification[] = [];

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /** Desktop alert when idle auto-pause pauses the timer. */
  showTimerIdlePaused(idleMs: number): { ok: boolean; message?: string } {
    const seconds = Math.max(1, Math.round(idleMs / 1000));
    const duration =
      seconds < 60
        ? `${seconds} seconds`
        : `${Math.max(1, Math.round(seconds / 60))} ${
            Math.round(seconds / 60) === 1 ? "minute" : "minutes"
          }`;
    return this.show(
      "Timer paused",
      `No mouse or keyboard activity for ${duration}. Your timer has been paused.`,
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

    if (process.platform === "win32") {
      void this.showWindowsToastFallback(safeTitle, safeBody);
      return { ok: true };
    }

    if (process.platform === "darwin") {
      void this.showMacOsascriptFallback(safeTitle, safeBody);
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
        ...(process.platform === "linux" && options?.urgency ? { urgency: options.urgency } : {}),
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
        if (process.platform === "linux") {
          void this.showLinuxNotifySend(title, body, options?.urgency);
        } else if (process.platform === "win32") {
          void this.showWindowsToastFallback(title, body);
        } else if (process.platform === "darwin") {
          void this.showMacOsascriptFallback(title, body);
        }
      });

      notification.show();
      if (process.platform === "darwin") {
        try {
          app.dock?.bounce("critical");
        } catch {
          // ignore
        }
      }
      log.info("[NotificationService] shown via Electron", { title, body });
      return { ok: true };
    } catch (error) {
      log.warn("[NotificationService] showElectron failed", error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to show notification",
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

  /**
   * macOS Notification Center via AppleScript (fallback when Electron toast fails).
   */
  private async showMacOsascriptFallback(title: string, body: string): Promise<boolean> {
    try {
      const escapeAs = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const script = `display notification "${escapeAs(body)}" with title "${escapeAs(title)}" sound name "Glass"`;
      await execFileAsync("osascript", ["-e", script], { timeout: 3000 });
      try {
        app.dock?.bounce("critical");
      } catch {
        // ignore
      }
      log.info("[NotificationService] shown via osascript", { title, body });
      return true;
    } catch (error) {
      log.warn("[NotificationService] osascript notification failed", error);
      return false;
    }
  }

  /**
   * Windows toast via PowerShell WinRT APIs (fallback when Electron toast fails).
   * Requires AppUserModelId set on the process (see main/index.ts).
   */
  private async showWindowsToastFallback(title: string, body: string): Promise<boolean> {
    try {
      const escapeXml = (value: string) =>
        value
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const toastXml = `
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>${escapeXml(title)}</text>
      <text>${escapeXml(body)}</text>
    </binding>
  </visual>
</toast>`.trim();

      const ps = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(@'
${toastXml}
'@)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('com.gr8r.timetracker')
$notifier.Show($toast)
`;

      await execFileAsync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
        { timeout: 5000, windowsHide: true },
      );
      log.info("[NotificationService] shown via Windows toast fallback", {
        title,
        body,
      });
      return true;
    } catch (error) {
      log.warn("[NotificationService] Windows toast fallback failed", error);
      return false;
    }
  }

  private resolveIconPath(): string | undefined {
    const fromResources = findExistingPath(resolveAppIconPaths());
    if (fromResources) return fromResources;

    const logoSvg = path.join(app.getAppPath(), "public", "figma", "logo.svg");
    if (fs.existsSync(logoSvg)) return logoSvg;

    // Dev fallback if utils path differs after compile
    const alt = path.join(getResourcesRoot(), "icons", "icon.png");
    return fs.existsSync(alt) ? alt : undefined;
  }

  private resolveIcon(): string | Electron.NativeImage | undefined {
    // Prefer PNG for Electron Notification (icns can fail to decode as toast icon).
    const root = getResourcesRoot();
    const preferred =
      process.platform === "darwin"
        ? [
            path.join(root, "icons", "icon.png"),
            path.join(root, "icons", "256x256.png"),
            path.join(root, "tray", "tray-icon.png"),
          ]
        : resolveAppIconPaths();
    const file = findExistingPath(preferred) ?? this.resolveIconPath();
    if (!file) return undefined;
    try {
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) return image;
    } catch {
      // fall through
    }
    return file.endsWith(".png") || file.endsWith(".ico") ? file : undefined;
  }

  list(): unknown[] {
    return [];
  }
}
