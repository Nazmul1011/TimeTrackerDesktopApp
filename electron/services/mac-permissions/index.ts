/**
 * macOS TCC helpers — Screen Recording + Automation (System Events).
 *
 * Electron's getMediaAccessStatus("screen") often reports "denied" even when
 * the System Settings toggle is already on. Never skip capture because of that
 * API. Ask at most once (not-determined probe). Real success/failure comes
 * from an actual screenshot attempt.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { app, desktopCapturer, shell, systemPreferences } from "electron";
import log from "electron-log/main";

const execFileAsync = promisify(execFile);

/** Must match `appId` in electron-builder.yml. */
const APP_BUNDLE_ID = "com.gr8r.timetracker";

export type MacPermissionStatus =
  "granted" | "denied" | "restricted" | "unknown" | "not-determined";

export class MacPermissions {
  private static screenProbeDone = false;
  private static captureBlockedThisProcess = false;
  private static cliUsedThisProcess = false;

  static getScreenStatus(): MacPermissionStatus {
    if (process.platform !== "darwin") return "granted";
    try {
      return systemPreferences.getMediaAccessStatus("screen") as MacPermissionStatus;
    } catch {
      return "unknown";
    }
  }

  static isCaptureBlocked(): boolean {
    return this.captureBlockedThisProcess;
  }

  static markCaptureSucceeded(): void {
    this.captureBlockedThisProcess = false;
  }

  static markCaptureFailed(): void {
    this.captureBlockedThisProcess = true;
  }

  static clearCaptureBlock(): void {
    this.captureBlockedThisProcess = false;
  }

  static canUseCliFallback(): boolean {
    return !this.cliUsedThisProcess;
  }

  static markCliUsed(): void {
    this.cliUsedThisProcess = true;
  }

  /**
   * Log TCC status and show the system prompt at most once.
   * Always returns true so capture can run — "denied" from Electron is often wrong
   * when Screen Recording is already enabled in System Settings.
   */
  static async ensureScreenRecording(): Promise<boolean> {
    if (process.platform !== "darwin") return true;

    let status = this.getScreenStatus();
    log.info("[MacPermissions] screen recording status:", status);

    if (status === "granted") return true;

    if (status === "not-determined" || status === "unknown") {
      if (!this.screenProbeDone) {
        this.screenProbeDone = true;
        try {
          await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 1, height: 1 },
            fetchWindowIcons: false,
          });
        } catch (error) {
          log.warn("[MacPermissions] screen permission probe failed", error);
        }
        status = this.getScreenStatus();
        log.info("[MacPermissions] screen recording status after probe:", status);
      }
    } else if (status === "denied" || status === "restricted") {
      log.info(
        "[MacPermissions] Electron reports denied — still capturing (Settings toggle is often already on)",
      );
    }

    return true;
  }

  static async requestScreenRecordingOnce(): Promise<boolean> {
    if (this.captureBlockedThisProcess) return false;
    await this.ensureScreenRecording();
    return true;
  }

  static async openScreenRecordingSettings(): Promise<void> {
    if (process.platform !== "darwin") return;
    try {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
      );
    } catch (error) {
      log.warn("[MacPermissions] open screen settings failed", error);
    }
  }

  /**
   * Clears this app's Screen Recording entry (same as `tccutil reset ScreenCapture <id>`)
   * and relaunches, so macOS asks again. Fixes a toggle that looks ON but belongs to an
   * older/differently signed copy. No sudo needed for the app's own bundle id.
   */
  static async resetScreenRecordingAndRelaunch(): Promise<{ ok: boolean; message?: string }> {
    if (process.platform !== "darwin") return { ok: false, message: "macOS only" };
    if (!app.isPackaged) {
      return { ok: false, message: "Only available in the installed app" };
    }
    try {
      await execFileAsync("/usr/bin/tccutil", ["reset", "ScreenCapture", APP_BUNDLE_ID], {
        timeout: 10_000,
      });
      log.info("[MacPermissions] Screen Recording permission reset — relaunching");
    } catch (error) {
      const err = error as { message?: string };
      log.warn("[MacPermissions] tccutil reset failed", error);
      return { ok: false, message: err.message || "Could not reset permission" };
    }
    app.relaunch();
    app.quit();
    return { ok: true };
  }

  static async openAccessibilitySettings(): Promise<void> {
    if (process.platform !== "darwin") return;
    try {
      await shell.openExternal(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
      );
    } catch (error) {
      log.warn("[MacPermissions] open accessibility settings failed", error);
    }
  }

  static async canReadFrontApp(): Promise<boolean> {
    if (process.platform !== "darwin") return true;
    try {
      await execFileAsync(
        "osascript",
        [
          "-e",
          'tell application "System Events" to get name of first application process whose frontmost is true',
        ],
        { timeout: 2000 },
      );
      return true;
    } catch {
      return false;
    }
  }
}
