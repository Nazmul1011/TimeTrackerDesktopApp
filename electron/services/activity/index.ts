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
  /** macOS .app path or Windows exe path when known */
  bundlePath?: string;
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
      const { stdout: nameOut } = await execFileAsync("xdotool", ["getwindowname", windowId], {
        timeout: 1500,
      });
      const title = nameOut.trim() || "Unknown";
      let appName = title.split(" — ").pop()?.split(" - ").pop()?.trim() || title;
      try {
        const { stdout: classOut } = await execFileAsync("xprop", ["-id", windowId, "WM_CLASS"], {
          timeout: 1500,
        });
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
    // Fast path: NSWorkspace app name + bundle path (no Accessibility required).
    const nsWorkspace = await this.getMacFrontmostApp();

    const jxaPath = path.join(getResourcesRoot(), "scripts", "get-active-window.jxa");
    const scptPath = path.join(getResourcesRoot(), "scripts", "get-active-window.applescript");

    try {
      const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", jxaPath], {
        timeout: 2500,
      });
      const parsed = this.parseMacWindowOutput(stdout);
      if (parsed.appName && parsed.appName !== "Desktop") {
        return {
          ...parsed,
          bundlePath: nsWorkspace?.bundlePath,
        };
      }
      if (nsWorkspace?.appName) {
        return {
          appName: nsWorkspace.appName,
          windowTitle: parsed.windowTitle || "",
          bundlePath: nsWorkspace.bundlePath,
        };
      }
      return parsed;
    } catch (error) {
      log.debug("[ActivityService] JXA active window failed", error);
    }

    try {
      const { stdout } = await execFileAsync("osascript", [scptPath], {
        timeout: 2500,
      });
      const parsed = this.parseMacWindowOutput(stdout);
      if (parsed.appName && parsed.appName !== "Desktop") {
        return { ...parsed, bundlePath: nsWorkspace?.bundlePath };
      }
      if (nsWorkspace?.appName) {
        return {
          appName: nsWorkspace.appName,
          windowTitle: parsed.windowTitle || "",
          bundlePath: nsWorkspace.bundlePath,
        };
      }
      return parsed;
    } catch (error) {
      log.debug("[ActivityService] AppleScript active window failed", error);
    }

    if (nsWorkspace?.appName) {
      return {
        appName: nsWorkspace.appName,
        windowTitle: "",
        bundlePath: nsWorkspace.bundlePath,
      };
    }

    log.warn(
      "[ActivityService] macOS active window unavailable — grant Accessibility for window titles if needed",
    );
    return { appName: "Desktop", windowTitle: "" };
  }

  private async getMacFrontmostApp(): Promise<{
    appName: string;
    bundlePath?: string;
  } | null> {
    try {
      const { stdout } = await execFileAsync(
        "osascript",
        [
          "-l",
          "JavaScript",
          "-e",
          'ObjC.import("AppKit"); var a=$.NSWorkspace.sharedWorkspace.frontmostApplication; var n=ObjC.unwrap(a.localizedName); var b=ObjC.unwrap(a.bundleIdentifier); var p=a.bundleURL?ObjC.unwrap(a.bundleURL.path):""; var name=(n&&String(n))||(b&&String(b))||""; name+"\\u001e"+String(p||"");',
        ],
        { timeout: 2000 },
      );
      const line = stdout.trim();
      const sep = line.indexOf("\u001e");
      if (sep < 0) {
        return line ? { appName: line } : null;
      }
      const appName = line.slice(0, sep).trim();
      const bundlePath = line.slice(sep + 1).trim() || undefined;
      if (!appName) return null;
      return { appName, bundlePath };
    } catch {
      return null;
    }
  }

  private parseMacWindowOutput(stdout: string): ActiveWindowInfo {
    const line =
      stdout
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s.includes("\u001e") || s.includes("|||")) ?? stdout.trim();

    if (line.includes("\u001e")) {
      const sep = line.indexOf("\u001e");
      return {
        appName: line.slice(0, sep).trim() || "Desktop",
        windowTitle: line.slice(sep + 1).trim(),
      };
    }
    if (line.includes("|||")) {
      const [appName, windowTitle = ""] = line.split("|||");
      return { appName: appName || "Desktop", windowTitle };
    }
    return { appName: line || "Desktop", windowTitle: "" };
  }

  /**
   * Windows foreground window via user32 + process metadata.
   * Uses a shipped PowerShell script for reliability on Windows.
   * Output: appName RS windowTitle RS exePath
   */
  private async getWindowsActiveWindow(): Promise<ActiveWindowInfo> {
    const scriptPath = path.join(getResourcesRoot(), "scripts", "get-active-window.ps1");

    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
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
    const parts = line.split("\u001e");
    const appName = (parts[0] ?? "").trim() || "Desktop";
    const windowTitle = (parts[1] ?? "").trim();
    const bundlePath = (parts[2] ?? "").trim() || undefined;
    return { appName, windowTitle, bundlePath };
  }
}
