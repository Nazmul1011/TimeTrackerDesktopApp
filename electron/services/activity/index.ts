/**
 * Active-window sampling for activity tracking.
 * Uses platform CLIs when available; falls back to a safe placeholder.
 */
import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import log from "electron-log/main";
import { getResourcesRoot } from "../../utils";

const execFileAsync = promisify(execFile);

export type ActiveWindowInfo = {
  appName: string;
  windowTitle: string;
};

export class ActivityService {
  private static instance: ActivityService | null = null;
  private running = false;
  private cache: { at: number; value: ActiveWindowInfo } | null = null;
  private static readonly CACHE_MS = 2_500;

  static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  start(): void {
    this.running = true;
    log.info("[ActivityService] started");
  }

  stop(): void {
    this.running = false;
    this.cache = null;
    log.info("[ActivityService] stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  async getActiveWindow(): Promise<ActiveWindowInfo> {
    if (this.cache && Date.now() - this.cache.at < ActivityService.CACHE_MS) {
      return this.cache.value;
    }
    try {
      let value: ActiveWindowInfo;
      if (process.platform === "linux") {
        value = await this.getLinuxActiveWindow();
      } else if (process.platform === "darwin") {
        value = await this.getMacActiveWindow();
      } else if (process.platform === "win32") {
        value = await this.getWindowsActiveWindow();
      } else {
        value = { appName: "Desktop", windowTitle: "" };
      }
      this.cache = { at: Date.now(), value };
      return value;
    } catch (error) {
      log.warn("[ActivityService] active window lookup failed", error);
    }
    return { appName: "Desktop", windowTitle: "" };
  }

  private async getLinuxActiveWindow(): Promise<ActiveWindowInfo> {
    try {
      const { stdout: idOut } = await execFileAsync("xdotool", ["getactivewindow"], {
        timeout: 1500,
      });
      const windowId = idOut.trim();
      const { stdout: nameOut } = await execFileAsync(
        "xdotool",
        ["getwindowname", windowId],
        { timeout: 1500 },
      );
      const title = nameOut.trim() || "Unknown";
      let appName = title.split(" — ").pop()?.split(" - ").pop()?.trim() || title;
      try {
        const { stdout: classOut } = await execFileAsync(
          "xprop",
          ["-id", windowId, "WM_CLASS"],
          { timeout: 1500 },
        );
        const match = classOut.match(/"([^"]+)"\s*,\s*"([^"]+)"/);
        if (match?.[1]) appName = match[1];
        else if (match?.[2]) appName = match[2];
      } catch {
        // ignore
      }
      return { appName, windowTitle: title };
    } catch {
      return { appName: "Desktop", windowTitle: "" };
    }
  }

  private async getMacActiveWindow(): Promise<ActiveWindowInfo> {
    const script = `
      tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        set winTitle to ""
        try
          set winTitle to name of front window of frontApp
        end try
        return appName & "|||" & winTitle
      end tell
    `;
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 2000,
    });
    const [appName, windowTitle = ""] = stdout.trim().split("|||");
    return { appName: appName || "Desktop", windowTitle };
  }

  /**
   * Windows foreground window via user32 + process metadata.
   * Uses a shipped PowerShell script for reliability on Windows.
   */
  private async getWindowsActiveWindow(): Promise<ActiveWindowInfo> {
    const scriptPath = path.join(
      getResourcesRoot(),
      "scripts",
      "get-active-window.ps1",
    );

    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ],
      {
        timeout: 4000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
    );

    const line =
      stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.includes("\u001e")) ?? stdout.trim();
    const sep = line.indexOf("\u001e");
    if (sep < 0) {
      return { appName: line || "Desktop", windowTitle: "" };
    }
    const appName = line.slice(0, sep).trim() || "Desktop";
    const windowTitle = line.slice(sep + 1).trim();
    return { appName, windowTitle };
  }
}
