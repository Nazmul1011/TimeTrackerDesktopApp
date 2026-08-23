/**
 * Screenshot capture via Electron desktopCapturer, with OS CLI fallbacks.
 * Linux/Wayland often returns empty thumbnails — fall back to gnome-screenshot/scrot/grim.
 */
import { desktopCapturer, screen } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
import log from "electron-log/main";

const execFileAsync = promisify(execFile);

export type CapturedScreenshot = {
  buffer: Buffer;
  width: number;
  height: number;
  capturedAt: string;
};

const MAX_THUMB_WIDTH = 1920;
const MAX_THUMB_HEIGHT = 1080;

export class ScreenshotService {
  private static instance: ScreenshotService | null = null;

  static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService();
    }
    return ScreenshotService.instance;
  }

  async capture(): Promise<CapturedScreenshot | null> {
    const capturedAt = new Date().toISOString();

    const viaElectron = await this.captureViaDesktopCapturer();
    if (viaElectron) {
      log.info(
        "[ScreenshotService] captured via desktopCapturer",
        viaElectron.width,
        "x",
        viaElectron.height,
      );
      return { ...viaElectron, capturedAt };
    }

    const viaCli = await this.captureViaCli();
    if (viaCli) {
      log.info(
        "[ScreenshotService] captured via CLI fallback",
        viaCli.width,
        "x",
        viaCli.height,
      );
      return { ...viaCli, capturedAt };
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
      const thumbWidth = Math.min(
        Math.floor(width * scale),
        MAX_THUMB_WIDTH,
      );
      const thumbHeight = Math.min(
        Math.floor(height * scale),
        MAX_THUMB_HEIGHT,
      );

      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: thumbWidth, height: thumbHeight },
        fetchWindowIcons: false,
      });

      const source =
        sources.find((s) => s.display_id === String(primary.id)) || sources[0];

      if (!source?.thumbnail || source.thumbnail.isEmpty()) {
        log.warn("[ScreenshotService] desktopCapturer returned empty thumbnail");
        return null;
      }

      // Reject near-black / tiny invalid captures (common Wayland failure)
      const size = source.thumbnail.getSize();
      if (size.width < 32 || size.height < 32) {
        log.warn("[ScreenshotService] thumbnail too small", size);
        return null;
      }

      const png = source.thumbnail.toPNG();
      if (!png.length) return null;

      return {
        buffer: png,
        width: size.width,
        height: size.height,
      };
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
      if (isWayland) {
        commands.push(
          { bin: "grim", args: [tmpPath] },
          { bin: "gnome-screenshot", args: ["-f", tmpPath] },
        );
      } else {
        // X11 — prefer non-interactive tools
        commands.push(
          { bin: "import", args: ["-window", "root", tmpPath] },
          { bin: "scrot", args: ["-o", tmpPath] },
          { bin: "gnome-screenshot", args: ["-f", tmpPath] },
        );
      }
    } else if (process.platform === "darwin") {
      commands.push({ bin: "screencapture", args: ["-x", tmpPath] });
    } else if (process.platform === "win32") {
      // PowerShell .NET screenshot
      const ps = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${tmpPath.replace(/'/g, "''")}')
$g.Dispose(); $bmp.Dispose()
`;
      commands.push({
        bin: "powershell",
        args: ["-NoProfile", "-Command", ps],
      });
    }

    for (const cmd of commands) {
      try {
        await execFileAsync(cmd.bin, cmd.args, { timeout: 8000 });
        const buffer = await fs.readFile(tmpPath);
        if (buffer.length < 100) {
          log.warn(`[ScreenshotService] ${cmd.bin} wrote tiny file`);
          continue;
        }
        // We don't parse PNG dimensions here — backend sharp will
        return {
          buffer,
          width: 0,
          height: 0,
        };
      } catch (error) {
        log.debug(`[ScreenshotService] ${cmd.bin} unavailable/failed`, error);
      } finally {
        void fs.unlink(tmpPath).catch(() => undefined);
      }
    }

    return null;
  }

  async list(): Promise<unknown[]> {
    return [];
  }
}
