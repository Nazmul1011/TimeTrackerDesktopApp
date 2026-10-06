/**
 * Native OS notifications (gated by Settings → Enable notifications).
 * Shown from the main process so alerts appear even when the app window is hidden.
 */
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { app, BrowserWindow, nativeImage, Notification, screen, shell } from "electron";
import log from "electron-log/main";
import { SettingsService } from "../settings";
import { WindowRevealService } from "../window-reveal";
import { findExistingPath, getResourcesRoot, resolveAppIconPaths } from "../../utils";

const execFileAsync = promisify(execFile);

export class NotificationService {
  private static instance: NotificationService | null = null;

  /** Keep references until closed — otherwise GC can drop the toast. */
  private active: Notification[] = [];
  private overlay: BrowserWindow | null = null;
  private overlayTimer: NodeJS.Timeout | null = null;

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
    return this.show("Timer paused", `Idle for ${duration}. Move mouse or press a key to resume.`, {
      urgency: "critical",
    });
  }

  /** Desktop alert when idle auto-pause ends and tracking starts again. */
  showTimerIdleResumed(): { ok: boolean; message?: string } {
    return this.show("Timer resumed", "Idle pause removed. Tracking is running.", {
      urgency: "normal",
    });
  }

  show(
    title: string,
    body: string,
    _options?: { urgency?: "normal" | "critical" | "low" },
  ): { ok: boolean; message?: string } {
    if (!SettingsService.getInstance().notificationsEnabled()) {
      log.info("[NotificationService] skipped — notifications disabled in settings");
      return { ok: false, message: "Notifications disabled in settings" };
    }

    const safeTitle = title || "Gr8r Time Tracker";
    const safeBody = body || "";

    // Compact on-screen banner only — native Windows toasts are large and
    // duplicated this banner. macOS already skips Notification Center.
    this.showOverlayBanner(safeTitle, safeBody);
    this.playAlertSound();
    return { ok: true };
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
        log.warn("[NotificationService] Notification Center rejected the banner", error);
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

  /**
   * Always-on-top banner that does not go through Notification Center.
   * Unsigned Electron on macOS is allowed to "show" a system toast, then macOS
   * never draws it — this is what the user actually sees.
   */
  private showOverlayBanner(title: string, body: string) {
    this.closeOverlay();

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    let targetDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const mainWin = BrowserWindow.getAllWindows().find(
      (w) => w !== this.overlay && !w.isDestroyed() && w.isVisible(),
    );
    if (mainWin) {
      targetDisplay = screen.getDisplayMatching(mainWin.getBounds());
    }

    const width = 260;
    const height = 52;
    const gap = 12;
    const x = Math.round(targetDisplay.workArea.x + targetDisplay.workArea.width - width - gap);
    const y = Math.round(targetDisplay.workArea.y + gap);

    const win = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: true,
      show: false,
      hasShadow: false,
      roundedCorners: true,
      title: "gr8r-idle-toast",
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, "floating");

    const titleLower = (title || "").toLowerCase();
    const bodyLower = (body || "").toLowerCase();
    const isPaused = titleLower.includes("pause") || bodyLower.includes("pause");
    const isResumed =
      titleLower.includes("start") ||
      titleLower.includes("resume") ||
      bodyLower.includes("resume") ||
      bodyLower.includes("running");
    const isStopped = titleLower.includes("stop") || bodyLower.includes("stop");

    let statusClass = "info";
    let statusIconSvg = `
      <div class="inner-circle">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="6" cy="6" r="4.5"/>
          <path d="M6 5.5v3M6 3.5h.01"/>
        </svg>
      </div>`;

    if (isPaused) {
      statusClass = "paused";
      statusIconSvg = `
        <div class="inner-circle">
          <svg viewBox="0 0 12 12" fill="currentColor">
            <rect x="3.2" y="2.8" width="1.8" height="6.4" rx="0.9"/>
            <rect x="7" y="2.8" width="1.8" height="6.4" rx="0.9"/>
          </svg>
        </div>`;
    } else if (isResumed) {
      statusClass = "active";
      statusIconSvg = `
        <div class="inner-circle">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5"/>
          </svg>
        </div>`;
    } else if (isStopped) {
      statusClass = "stopped";
      statusIconSvg = `
        <div class="inner-circle">
          <svg viewBox="0 0 12 12" fill="currentColor">
            <rect x="3" y="3" width="6" height="6" rx="1.2"/>
          </svg>
        </div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  }
  .wrapper {
    width: 100%;
    height: 100%;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    width: 100%;
    height: 100%;
    background: #0c111d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 18px -4px rgba(0, 0, 0, 0.55);
    border-radius: 10px;
    padding: 6px 8px;
    color: #fff;
    display: flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
    transition: border-color 0.2s ease;
  }
  .card:hover {
    border-color: rgba(255, 255, 255, 0.16);
  }
  /* Concentric circle status icon */
  .status-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .status-icon.active {
    background: rgba(16, 185, 129, 0.12);
    border: 1.5px solid rgba(16, 185, 129, 0.22);
    color: #10b981;
  }
  .status-icon.active .inner-circle {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.2px solid #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .status-icon.paused {
    background: rgba(245, 158, 11, 0.12);
    border: 1.5px solid rgba(245, 158, 11, 0.22);
    color: #f59e0b;
  }
  .status-icon.paused .inner-circle {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.2px solid #f59e0b;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .status-icon.stopped {
    background: rgba(239, 68, 68, 0.12);
    border: 1.5px solid rgba(239, 68, 68, 0.22);
    color: #ef4444;
  }
  .status-icon.stopped .inner-circle {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.2px solid #ef4444;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .status-icon.info {
    background: rgba(43, 127, 255, 0.12);
    border: 1.5px solid rgba(43, 127, 255, 0.22);
    color: #2b7fff;
  }
  .status-icon.info .inner-circle {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.2px solid #2b7fff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .status-icon svg {
    width: 8px;
    height: 8px;
  }
  .content {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: -0.01em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .body {
    margin-top: 1px;
    font-size: 10px;
    line-height: 1.25;
    color: #94a3b8;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .close-btn {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s ease, background 0.15s ease;
    margin-right: -2px;
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
  }
  .close-btn svg {
    width: 9px;
    height: 9px;
  }
</style>
<script>
  function dismissBanner() {
    try { window.location.href = "custom://close"; } catch(e) {}
  }
  function revealApp() {
    try { window.location.href = "custom://reveal"; } catch(e) {}
  }
</script>
</head>
<body>
  <div class="wrapper">
    <div class="card" onclick="revealApp()">
      <div class="status-icon ${statusClass}">
        ${statusIconSvg}
      </div>
      <div class="content">
        <div class="title">${escapeHtml(title)}</div>
        <div class="body">${escapeHtml(body)}</div>
      </div>
      <button class="close-btn" onclick="event.stopPropagation(); dismissBanner();" aria-label="Close">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M2 2l8 8M10 2l-8 8"/>
        </svg>
      </button>
    </div>
  </div>
</body>
</html>`;

    win.on("closed", () => {
      if (this.overlay === win) this.overlay = null;
    });

    win.webContents.on("will-navigate", (event, url) => {
      if (url.startsWith("custom://close")) {
        event.preventDefault();
        this.closeOverlay();
      } else if (url.startsWith("custom://reveal")) {
        event.preventDefault();
        this.closeOverlay();
        WindowRevealService.getInstance().revealNow();
      }
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    void (async () => {
      try {
        await win.loadURL(dataUrl);
        if (win.isDestroyed()) return;
        win.showInactive();
        win.moveTop();
        log.info("[NotificationService] on-screen banner visible", {
          title,
          x,
          y,
          displayId: targetDisplay.id,
        });
      } catch (error) {
        log.warn("[NotificationService] on-screen banner failed", error);
      }
    })();

    this.overlay = win;
    this.overlayTimer = setTimeout(() => this.closeOverlay(), 7_000);
  }

  private playAlertSound() {
    if (process.platform === "darwin") {
      void execFileAsync("afplay", ["/System/Library/Sounds/Glass.aiff"], {
        timeout: 4000,
      }).catch((error) => {
        log.warn("[NotificationService] afplay failed", error);
        try {
          shell.beep();
        } catch {
          // ignore
        }
      });
      return;
    }
    try {
      shell.beep();
    } catch {
      // ignore
    }
  }

  private closeOverlay() {
    if (this.overlayTimer) {
      clearTimeout(this.overlayTimer);
      this.overlayTimer = null;
    }
    if (this.overlay && !this.overlay.isDestroyed()) {
      this.overlay.close();
    }
    this.overlay = null;
  }

  private brandIconDataUrl(): string | null {
    const logoSvg = path.join(app.getAppPath(), "public", "figma", "logo.svg");
    const file = (fs.existsSync(logoSvg) ? logoSvg : null) ?? this.resolveIconPath();
    if (!file) return null;
    try {
      const buf = fs.readFileSync(file);
      const mime = file.endsWith(".svg")
        ? "image/svg+xml"
        : file.endsWith(".ico")
          ? "image/x-icon"
          : "image/png";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return null;
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
