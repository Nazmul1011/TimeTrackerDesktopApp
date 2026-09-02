/**
 * Screenshot capture via Electron desktopCapturer, with OS CLI fallbacks.
 * macOS requires Screen Recording permission (TCC) for both paths.
 */
import { desktopCapturer, screen } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import log from "electron-log/main";
import { MacPermissions } from "../mac-permissions";

const execFileAsync = promisify(execFile);

export type CapturedScreenshot = {
  buffer: Buffer;
  width: number;
  height: number;
  capturedAt: string;
};

const THUMB_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 800, height: 450 },
] as const;

const EXEC_ENV = {
  ...process.env,
  PATH: [
    process.env.PATH,
    "/usr/bin",
    "/bin",
    "/usr/local/bin",
    "/snap/bin",
  ]
    .filter(Boolean)
    .join(path.delimiter),
};

export class ScreenshotService {
  private static instance: ScreenshotService | null = null;
  private macPermissionWarned = false;

  static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService();
    }
    return ScreenshotService.instance;
  }

  async capture(): Promise<CapturedScreenshot | null> {
    const capturedAt = new Date().toISOString();

    if (process.platform === "darwin") {
      // Probe / log TCC status. Always attempt capture — first call triggers the prompt.
      const allowed = await MacPermissions.ensureScreenRecording();
      if (!allowed && !this.macPermissionWarned) {
        this.macPermissionWarned = true;
        log.warn(
          "[ScreenshotService] Screen Recording denied — enable it in System Settings → Privacy & Security → Screen Recording for Electron/Gr8r, then fully quit and reopen the app",
        );
        void MacPermissions.openScreenRecordingSettings();
      }
    }

    const isWayland = Boolean(process.env.WAYLAND_DISPLAY);
    const order = isWayland
      ? (["cli", "electron"] as const)
      : (["electron", "cli"] as const);

    for (const method of order) {
      const shot =
        method === "electron"
          ? await this.captureViaDesktopCapturer()
          : await this.captureViaCli();
      if (shot?.buffer?.length) {
        log.info(
          `[ScreenshotService] captured via ${method}`,
          shot.width,
          "x",
          shot.height,
        );
        return { ...shot, capturedAt };
      }
    }

    if (process.platform === "darwin" && !this.macPermissionWarned) {
      const status = MacPermissions.getScreenStatus();
      if (status !== "granted") {
        this.macPermissionWarned = true;
        log.warn(
          `[ScreenshotService] capture failed (screen status=${status}) — grant Screen Recording and restart`,
        );
      }
    }

    log.error("[ScreenshotService] All capture methods failed");
    return null;
  }

  private async captureViaDesktopCapturer(): Promise<Omit<
    CapturedScreenshot,
    "capturedAt"
  > | null> {
    try {
      const primary = screen.getPrimaryDisplay();
      const { width, height } = primary.size;
      const scale = Math.min(primary.scaleFactor || 1, 2);

      for (const max of THUMB_SIZES) {
        const thumbWidth = Math.min(Math.floor(width * scale), max.width);
        const thumbHeight = Math.min(Math.floor(height * scale), max.height);
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: thumbWidth, height: thumbHeight },
          fetchWindowIcons: false,
        });

        const ranked = sources
          .map((source) => ({
            source,
            size: source.thumbnail?.getSize() ?? { width: 0, height: 0 },
          }))
          .filter(
            ({ source, size }) =>
              source.thumbnail &&
              !source.thumbnail.isEmpty() &&
              size.width >= 32 &&
              size.height >= 32,
          )
          .sort(
            (a, b) =>
              b.size.width * b.size.height - a.size.width * a.size.height,
          );

        const preferred =
          ranked.find(
            ({ source }) => source.display_id === String(primary.id),
          ) ?? ranked[0];

        if (!preferred) continue;

        const png = preferred.source.thumbnail.toPNG();
        if (!png.length) continue;

        return {
          buffer: png,
          width: preferred.size.width,
          height: preferred.size.height,
        };
      }

      log.warn("[ScreenshotService] desktopCapturer returned empty thumbnail");
      return null;
    } catch (error) {
      log.warn("[ScreenshotService] desktopCapturer failed", error);
      return null;
    }
  }

  private async captureViaCli(): Promise<Omit<
    CapturedScreenshot,
    "capturedAt"
  > | null> {
    const tmpPath = path.join(
      os.tmpdir(),
      `gr8r-screenshot-${Date.now()}-${process.pid}.png`,
    );

    const commands: Array<{ bin: string; args: string[] }> = [];

    if (process.platform === "linux") {
      const isWayland = Boolean(process.env.WAYLAND_DISPLAY);
      commands.push({
        bin: "gdbus",
        args: [
          "call",
          "--session",
          "--dest",
          "org.gnome.Shell.Screenshot",
          "--object-path",
          "/org/gnome/Shell/Screenshot",
          "--method",
          "org.gnome.Shell.Screenshot.Screenshot",
          "false",
          "false",
          tmpPath,
        ],
      });
      if (isWayland) {
        commands.push(
          { bin: "grim", args: [tmpPath] },
          { bin: "gnome-screenshot", args: ["-f", tmpPath] },
          { bin: "spectacle", args: ["-b", "-n", "-o", tmpPath] },
        );
      } else {
        commands.push(
          { bin: "import", args: ["-silent", "-window", "root", tmpPath] },
          { bin: "maim", args: [tmpPath] },
          { bin: "scrot", args: ["-o", tmpPath] },
          { bin: "gnome-screenshot", args: ["-f", tmpPath] },
          { bin: "spectacle", args: ["-b", "-n", "-o", tmpPath] },
        );
      }
    } else if (process.platform === "darwin") {
      // Silent PNG capture of the full desktop (triggers Screen Recording TCC).
      commands.push({
        bin: "/usr/sbin/screencapture",
        args: ["-x", "-t", "png", tmpPath],
      });
      commands.push({
        bin: "screencapture",
        args: ["-x", "-t", "png", tmpPath],
      });
    } else if (process.platform === "win32") {
      const safePath = tmpPath.replace(/'/g, "''");
      const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)
$bmp.Save('${safePath}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`;
      commands.push({
        bin: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          ps,
        ],
      });
    }

    for (const cmd of commands) {
      try {
        await execFileAsync(cmd.bin, cmd.args, {
          timeout: 8000,
          env: EXEC_ENV,
          windowsHide: true,
        });
        const buffer = await fs.readFile(tmpPath);
        if (buffer.length < 100) {
          log.warn(`[ScreenshotService] ${cmd.bin} wrote tiny file`);
          continue;
        }
        // Unlink after successful read (do not use finally — that raced the next attempt).
        void fs.unlink(tmpPath).catch(() => undefined);
        return {
          buffer,
          width: 0,
          height: 0,
        };
      } catch (error) {
        log.debug(`[ScreenshotService] ${cmd.bin} unavailable/failed`, error);
        void fs.unlink(tmpPath).catch(() => undefined);
      }
    }

    return null;
  }

  async list(): Promise<unknown[]> {
    return [];
  }
}
