/**
 * Active-window sampling for activity tracking.
 * Uses platform CLIs when available; falls back to a safe placeholder.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import log from "electron-log/main";

const execFileAsync = promisify(execFile);

export type ActiveWindowInfo = {
  appName: string;
  windowTitle: string;
};

export class ActivityService {
  private static instance: ActivityService | null = null;
  private running = false;

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
    log.info("[ActivityService] stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  async getActiveWindow(): Promise<ActiveWindowInfo> {
    try {
      if (process.platform === "linux") {
        return await this.getLinuxActiveWindow();
      }
      if (process.platform === "darwin") {
        return await this.getMacActiveWindow();
      }
      if (process.platform === "win32") {
        return await this.getWindowsActiveWindow();
      }
    } catch (error) {
      log.warn("[ActivityService] active window lookup failed", error);
    }
    return { appName: "Desktop", windowTitle: "" };
  }

  private async getLinuxActiveWindow(): Promise<ActiveWindowInfo> {
    // Prefer xdotool when on X11
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
        // WM_CLASS is "instance", "class" — prefer instance (e.g. google-chrome)
        const match = classOut.match(/"([^"]+)"\s*,\s*"([^"]+)"/);
        if (match?.[1]) appName = match[1];
        else if (match?.[2]) appName = match[2];
      } catch {
        // ignore
      }
      return { appName, windowTitle: title };
    } catch {
      // Wayland / missing tools
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

  private async getWindowsActiveWindow(): Promise<ActiveWindowInfo> {
    const ps = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$hwnd = [Win]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[void][Win]::GetWindowText($hwnd, $sb, $sb.Capacity)
$pidOut = 0
[void][Win]::GetWindowThreadProcessId($hwnd, [ref]$pidOut)
$proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
$app = if ($proc) { $proc.ProcessName } else { "Desktop" }
Write-Output ($app + "|||" + $sb.ToString())
`;
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-Command", ps],
      { timeout: 3000 },
    );
    const [appName, windowTitle = ""] = stdout.trim().split("|||");
    return { appName: appName || "Desktop", windowTitle };
  }
}
