/**
 * Screenshot capture via Electron desktopCapturer, with OS CLI fallbacks.
 * Multiple monitors are stitched into one image (virtual-desktop layout).
 * macOS requires Screen Recording permission (TCC) for both paths.
 */
import { desktopCapturer, nativeImage, screen, type Display } from "electron";
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

/** Cap stitched output so 3×4K desks stay uploadable. */
const MAX_STITCH_EDGE = 3840;

const EXEC_ENV = {
  ...process.env,
  PATH: [process.env.PATH, "/usr/bin", "/bin", "/usr/local/bin", "/snap/bin"]
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
    const order = isWayland ? (["cli", "electron"] as const) : (["electron", "cli"] as const);

    for (const method of order) {
      const shot =
        method === "electron" ? await this.captureViaDesktopCapturer() : await this.captureViaCli();
      if (shot?.buffer?.length) {
        log.info(`[ScreenshotService] captured via ${method}`, shot.width, "x", shot.height);
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
      const displays = screen.getAllDisplays();
      if (displays.length > 1) {
        const stitched = await this.captureAllDisplaysStitched(displays);
        if (stitched) return stitched;
        log.warn(
          "[ScreenshotService] multi-display stitch failed — trying CLI full-desktop fallback",
        );
        return null;
      }
      return await this.capturePrimaryDisplay();
    } catch (error) {
      log.warn("[ScreenshotService] desktopCapturer failed", error);
      return null;
    }
  }

  private async capturePrimaryDisplay(): Promise<Omit<CapturedScreenshot, "capturedAt"> | null> {
    const primary = screen.getPrimaryDisplay();
    const { width, height } = primary.size;
    const scale = Math.min(primary.scaleFactor || 1, 2);

    for (const max of THUMB_SIZES) {
      const thumbWidth = Math.min(Math.floor(width * scale), max.width);
      const thumbHeight = Math.min(Math.floor(height * scale), max.height);
      const image = await this.captureDisplayThumbnail(primary, {
        width: thumbWidth,
        height: thumbHeight,
      });
      if (!image) continue;
      const size = image.getSize();
      const png = image.toPNG();
      if (!png.length) continue;
      return { buffer: png, width: size.width, height: size.height };
    }

    log.warn("[ScreenshotService] desktopCapturer returned empty thumbnail");
    return null;
  }

  /**
   * Capture every monitor and stitch into one image in virtual-desktop layout.
   * Gaps (uneven arrangements) stay black.
   */
  private async captureAllDisplaysStitched(
    displays: Display[],
  ): Promise<Omit<CapturedScreenshot, "capturedAt"> | null> {
    const layers: Array<{
      image: Electron.NativeImage;
      destX: number;
      destY: number;
      destW: number;
      destH: number;
    }> = [];

    const minX = Math.min(...displays.map((d) => d.bounds.x));
    const minY = Math.min(...displays.map((d) => d.bounds.y));
    const outW = Math.round(Math.max(...displays.map((d) => d.bounds.x + d.bounds.width)) - minX);
    const outH = Math.round(Math.max(...displays.map((d) => d.bounds.y + d.bounds.height)) - minY);
    if (outW < 32 || outH < 32) return null;

    const fit = Math.min(1, MAX_STITCH_EDGE / outW, MAX_STITCH_EDGE / outH);

    for (const display of displays) {
      const scale = Math.min(display.scaleFactor || 1, 2);
      const thumbW = Math.min(Math.floor(display.size.width * scale), THUMB_SIZES[0].width);
      const thumbH = Math.min(Math.floor(display.size.height * scale), THUMB_SIZES[0].height);
      const image = await this.captureDisplayThumbnail(display, {
        width: Math.max(32, thumbW),
        height: Math.max(32, thumbH),
      });
      if (!image) {
        log.warn(`[ScreenshotService] skipped display ${display.id} — empty capture`);
        continue;
      }
      layers.push({
        image,
        destX: Math.round((display.bounds.x - minX) * fit),
        destY: Math.round((display.bounds.y - minY) * fit),
        destW: Math.max(1, Math.round(display.bounds.width * fit)),
        destH: Math.max(1, Math.round(display.bounds.height * fit)),
      });
    }

    if (layers.length === 0) return null;

    const canvasW = Math.max(1, Math.round(outW * fit));
    const canvasH = Math.max(1, Math.round(outH * fit));
    const png = this.stitchNativeImages(layers, canvasW, canvasH);
    if (!png?.length) return null;

    log.info(
      `[ScreenshotService] stitched ${layers.length}/${displays.length} displays into ${canvasW}x${canvasH}`,
    );
    return { buffer: png, width: canvasW, height: canvasH };
  }

  private async captureDisplayThumbnail(
    display: Display,
    thumbnailSize: { width: number; height: number },
  ): Promise<Electron.NativeImage | null> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize,
      fetchWindowIcons: false,
    });

    const usable = sources.filter(
      (source) =>
        source.thumbnail &&
        !source.thumbnail.isEmpty() &&
        (source.thumbnail.getSize().width ?? 0) >= 32 &&
        (source.thumbnail.getSize().height ?? 0) >= 32,
    );

    const byId = usable.find((source) => source.display_id === String(display.id));
    if (byId) return byId.thumbnail;

    const displays = screen.getAllDisplays();
    const index = displays.findIndex((d) => d.id === display.id);
    if (index >= 0 && usable[index]) return usable[index].thumbnail;

    return usable.length === 1 ? (usable[0]?.thumbnail ?? null) : null;
  }

  private stitchNativeImages(
    layers: Array<{
      image: Electron.NativeImage;
      destX: number;
      destY: number;
      destW: number;
      destH: number;
    }>,
    outW: number,
    outH: number,
  ): Buffer | null {
    try {
      const out = Buffer.alloc(outW * outH * 4, 0);
      for (const layer of layers) {
        const resized = layer.image.resize({
          width: layer.destW,
          height: layer.destH,
        });
        if (resized.isEmpty()) continue;
        const { width: srcW, height: srcH } = resized.getSize();
        const bitmap = resized.toBitmap();
        for (let y = 0; y < srcH; y += 1) {
          const dy = layer.destY + y;
          if (dy < 0 || dy >= outH) continue;
          const srcStart = y * srcW * 4;
          const dstStart = (dy * outW + layer.destX) * 4;
          const copyW = Math.min(srcW, outW - layer.destX);
          if (copyW <= 0 || layer.destX >= outW) continue;
          const srcEnd = srcStart + copyW * 4;
          if (srcEnd > bitmap.length) continue;
          bitmap.copy(out, dstStart, srcStart, srcEnd);
        }
      }
      const composed = nativeImage.createFromBitmap(out, {
        width: outW,
        height: outH,
      });
      if (composed.isEmpty()) return null;
      const png = composed.toPNG();
      return png.length ? png : null;
    } catch (error) {
      log.warn("[ScreenshotService] stitch failed", error);
      return null;
    }
  }

  private async captureViaCli(): Promise<Omit<CapturedScreenshot, "capturedAt"> | null> {
    const tmpPath = path.join(os.tmpdir(), `gr8r-screenshot-${Date.now()}-${process.pid}.png`);

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
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
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
