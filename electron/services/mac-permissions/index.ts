/**
 * macOS TCC helpers — Screen Recording + Automation (System Events).
 * Screen Recording is prompted by using desktopCapturer (not askForMediaAccess).
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { desktopCapturer, shell, systemPreferences } from "electron";
import log from "electron-log/main";

const execFileAsync = promisify(execFile);

export type MacPermissionStatus =
  | "granted"
  | "denied"
  | "restricted"
  | "unknown"
  | "not-determined";

export class MacPermissions {
  private static screenProbeDone = false;

  static getScreenStatus(): MacPermissionStatus {
    if (process.platform !== "darwin") return "granted";
    try {
      return systemPreferences.getMediaAccessStatus(
        "screen",
      ) as MacPermissionStatus;
    } catch {
      return "unknown";
    }
  }

  /**
   * Ensure Screen Recording access for desktopCapturer / screencapture.
   * Returns true when capture should be attempted (granted OR not-determined).
   * Returns false only when explicitly denied/restricted.
   */
  static async ensureScreenRecording(): Promise<boolean> {
    if (process.platform !== "darwin") return true;

    let status = this.getScreenStatus();
    log.info("[MacPermissions] screen recording status:", status);

    if (status === "granted") return true;
    if (status === "denied" || status === "restricted") {
      log.warn(
        "[MacPermissions] Screen Recording denied — enable Gr8r Time Tracker (or Electron) in System Settings → Privacy & Security → Screen Recording, then restart",
      );
      return false;
    }

    // not-determined / unknown — trigger the macOS TCC prompt via desktopCapturer.
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

    // Still allow capture attempts while the user decides (not-determined).
    return status !== "denied" && status !== "restricted";
  }

  /** Open System Settings → Privacy & Security → Screen Recording. */
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

  /** Open Accessibility settings (needed for System Events window titles). */
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

  /** Probe whether System Events can read the frontmost process. */
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
