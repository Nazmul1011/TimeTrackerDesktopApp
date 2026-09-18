/**
 * Screenshot capture via Electron desktopCapturer, with OS CLI fallbacks.
 * macOS requires Screen Recording permission (TCC) for both paths.
 */
import { desktopCapturer, nativeImage, screen, type Display, type NativeImage } from "electron";
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

/** Longest edge of a stitched multi-monitor image (fits laptop + external). */
const STITCH_MAX_EDGE = 5120;

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

  resetWarnings(): void {
    this.macPermissionWarned = false;
  }

  async capture(): Promise<CapturedScreenshot | null> {
    const capturedAt = new Date().toISOString();

    if (process.platform === "darwin") {
      await MacPermissions.ensureScreenRecording();
    }

    const isWayland = Boolean(process.env.WAYLAND_DISPLAY);
    const order = isWayland ? (["cli", "electron"] as const) : (["electron", "cli"] as const);

    for (const method of order) {
      if (process.platform === "darwin" && method === "cli") {
        if (!MacPermissions.canUseCliFallback()) continue;
        MacPermissions.markCliUsed();
      }
      const shot =
        method === "electron" ? await this.captureViaDesktopCapturer() : await this.captureViaCli();
      if (shot?.buffer?.length) {
        MacPermissions.markCaptureSucceeded();
        log.info(`[ScreenshotService] captured via ${method}`, shot.width, "x", shot.height);
        return { ...shot, capturedAt };
      }
    }

    if (process.platform === "darwin" && !this.macPermissionWarned) {
      this.macPermissionWarned = true;
      log.warn(
        `[ScreenshotService] capture failed (screen status=${MacPermissions.getScreenStatus()})`,
      );
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
      const thumb = stitchThumbnailSize(displays);
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: thumb,
        fetchWindowIcons: false,
      });
      const usable = usableSources(sources);
      if (!usable.length) {
        log.warn("[ScreenshotService] desktopCapturer returned empty thumbnail");
        return null;
      }

      if (displays.length > 1) {
        const stitched = stitchFromSources(displays, usable);
        if (stitched) return stitched;
        log.warn("[ScreenshotService] stitch failed — falling back to primary display");
      }

      const primary = screen.getPrimaryDisplay();
      const preferred =
        usable.find(({ source }) => source.display_id === String(primary.id)) ??
        usable.sort((a, b) => b.size.width * b.size.height - a.size.width * a.size.height)[0];
      if (!preferred) return null;
      const png = preferred.source.thumbnail.toPNG();
      if (!png.length) return null;
      return {
        buffer: png,
        width: preferred.size.width,
        height: preferred.size.height,
      };
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
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: thumbWidth, height: thumbHeight },
        fetchWindowIcons: false,
      });

      const ranked = usableSources(sources).sort(
        (a, b) => b.size.width * b.size.height - a.size.width * a.size.height,
      );

      const preferred =
        ranked.find(({ source }) => source.display_id === String(primary.id)) ?? ranked[0];

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
  }

  private async captureAllDisplaysStitched(
    displays: Display[],
  ): Promise<Omit<CapturedScreenshot, "capturedAt"> | null> {
    const thumb = stitchThumbnailSize(displays);
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: thumb,
      fetchWindowIcons: false,
    });

    const usable = usableSources(sources);
    if (!usable.length) return null;

    const used = new Set<string>();
    const tiles: StitchTile[] = [];

    for (const display of displays) {
      const match =
        usable.find(
          ({ source }) => !used.has(source.id) && source.display_id === String(display.id),
        ) ?? usable.find(({ source }) => !used.has(source.id));
      if (!match) continue;
      used.add(match.source.id);
      tiles.push({ display, image: match.source.thumbnail });
    }

    if (tiles.length < 2) return null;

    const stitched = stitchDisplayTiles(tiles);
    if (!stitched) return null;

    log.info(
      `[ScreenshotService] stitched ${tiles.length} displays into ${stitched.width}x${stitched.height}`,
    );
    return stitched;
  }

  /**
   * macOS default `screencapture` is main display only. Capture each screen
   * with -D and stitch using the real arrangement.
   */
  private async captureMacAllDisplays(): Promise<Omit<CapturedScreenshot, "capturedAt"> | null> {
    const displays = screen.getAllDisplays();
    if (!displays.length) return null;

    const images: Array<{ image: NativeImage; index: number }> = [];
    for (let i = 1; i <= displays.length; i += 1) {
      const tmpPath = path.join(
        os.tmpdir(),
        `gr8r-screenshot-${process.pid}-d${i}-${Date.now()}.png`,
      );
      try {
        await execFileAsync(
          "/usr/sbin/screencapture",
          ["-x", "-t", "png", "-D", String(i), tmpPath],
          { timeout: 120_000, env: EXEC_ENV },
        );
        const buffer = await fs.readFile(tmpPath);
        void fs.unlink(tmpPath).catch(() => undefined);
        if (buffer.length < 100) continue;
        const image = nativeImage.createFromBuffer(buffer);
        if (!image || image.isEmpty()) continue;
        images.push({ image, index: i });
      } catch (error) {
        const err = error as { message?: string };
        log.warn(`[ScreenshotService] screencapture -D ${i} failed: ${err.message || error}`);
        void fs.unlink(tmpPath).catch(() => undefined);
      }
    }

    if (!images.length) return null;

    if (images.length === 1 || displays.length === 1) {
      const size = images[0].image.getSize();
      return {
        buffer: images[0].image.toPNG(),
        width: size.width,
        height: size.height,
      };
    }

    const remaining = [...displays];
    const tiles: StitchTile[] = [];
    for (const { image } of images) {
      const { width, height } = image.getSize();
      const matchIndex = remaining.findIndex((display) =>
        displayMatchesPixels(display, width, height),
      );
      const display = matchIndex >= 0 ? remaining.splice(matchIndex, 1)[0] : remaining.shift();
      if (!display) break;
      tiles.push({ display, image });
    }

    if (tiles.length < 2) {
      const size = images[0].image.getSize();
      return {
        buffer: images[0].image.toPNG(),
        width: size.width,
        height: size.height,
      };
    }

    const stitched = stitchDisplayTiles(tiles);
    if (!stitched) return null;
    log.info(
      `[ScreenshotService] stitched ${tiles.length} mac displays into ${stitched.width}x${stitched.height}`,
    );
    return stitched;
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
      commands.push({
        bin: "/usr/sbin/screencapture",
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
          log.warn(`[ScreenshotService] ${cmd.bin} wrote tiny file (${buffer.length} bytes)`);
          continue;
        }
        // Unlink after successful read (do not use finally — that raced the next attempt).
        void fs.unlink(tmpPath).catch(() => undefined);
        const image = nativeImage.createFromBuffer(buffer);
        const size = image.isEmpty() ? { width: 0, height: 0 } : image.getSize();
        return {
          buffer,
          width: size.width,
          height: size.height,
        };
      } catch (error) {
        const err = error as { message?: string; stderr?: string | Buffer; code?: string | number };
        log.warn(
          `[ScreenshotService] ${cmd.bin} failed: ${err.message || error}` +
            (err.stderr ? ` stderr=${String(err.stderr).slice(0, 300)}` : ""),
        );
        void fs.unlink(tmpPath).catch(() => undefined);
      }
    }

    return null;
  }

  async list(): Promise<unknown[]> {
    return [];
  }
}

type SourceTile = {
  source: Electron.DesktopCapturerSource;
  size: { width: number; height: number };
};

type StitchTile = {
  display: Display;
  image: Electron.NativeImage;
};

function stitchFromSources(
  displays: Display[],
  usable: SourceTile[],
): Omit<CapturedScreenshot, "capturedAt"> | null {
  const used = new Set<string>();
  const tiles: StitchTile[] = [];

  for (const display of displays) {
    const match =
      usable.find(
        ({ source }) => !used.has(source.id) && source.display_id === String(display.id),
      ) ?? usable.find(({ source }) => !used.has(source.id));
    if (!match) continue;
    used.add(match.source.id);
    tiles.push({ display, image: match.source.thumbnail });
  }

  if (tiles.length < 2) return null;

  const stitched = stitchDisplayTiles(tiles);
  if (!stitched) return null;

  log.info(
    `[ScreenshotService] stitched ${tiles.length} displays into ${stitched.width}x${stitched.height}`,
  );
  return stitched;
}

function usableSources(sources: Electron.DesktopCapturerSource[]): SourceTile[] {
  return sources
    .map((source) => ({
      source,
      size: source.thumbnail?.getSize() ?? { width: 0, height: 0 },
    }))
    .filter(
      ({ source, size }) =>
        source.thumbnail && !source.thumbnail.isEmpty() && size.width >= 32 && size.height >= 32,
    );
}

function displayMatchesPixels(display: Display, width: number, height: number): boolean {
  const scale = display.scaleFactor || 1;
  const pairs: Array<[number, number]> = [
    [display.size.width, display.size.height],
    [Math.round(display.size.width * scale), Math.round(display.size.height * scale)],
    [display.bounds.width, display.bounds.height],
    [Math.round(display.bounds.width * scale), Math.round(display.bounds.height * scale)],
  ];
  return pairs.some(([w, h]) => Math.abs(w - width) <= 4 && Math.abs(h - height) <= 4);
}

function stitchThumbnailSize(displays: Display[]): { width: number; height: number } {
  let width = 1920;
  let height = 1080;
  for (const display of displays) {
    const scale = Math.min(display.scaleFactor || 1, 2);
    width = Math.max(width, Math.floor(display.size.width * scale));
    height = Math.max(height, Math.floor(display.size.height * scale));
  }
  return {
    width: Math.min(width, STITCH_MAX_EDGE),
    height: Math.min(height, STITCH_MAX_EDGE),
  };
}

function stitchDisplayTiles(tiles: StitchTile[]): Omit<CapturedScreenshot, "capturedAt"> | null {
  const minX = Math.min(...tiles.map((t) => t.display.bounds.x));
  const minY = Math.min(...tiles.map((t) => t.display.bounds.y));
  const maxX = Math.max(...tiles.map((t) => t.display.bounds.x + t.display.bounds.width));
  const maxY = Math.max(...tiles.map((t) => t.display.bounds.y + t.display.bounds.height));
  const logicalW = maxX - minX;
  const logicalH = maxY - minY;
  if (logicalW < 32 || logicalH < 32) return null;

  let scale = Math.min(2, Math.max(...tiles.map((t) => t.display.scaleFactor || 1)));
  const longest = Math.max(logicalW, logicalH) * scale;
  if (longest > STITCH_MAX_EDGE) {
    scale = STITCH_MAX_EDGE / Math.max(logicalW, logicalH);
  }

  const canvasW = Math.max(1, Math.round(logicalW * scale));
  const canvasH = Math.max(1, Math.round(logicalH * scale));
  const dest = Buffer.alloc(canvasW * canvasH * 4, 0);
  for (let i = 3; i < dest.length; i += 4) dest[i] = 255;

  for (const tile of tiles) {
    const destW = Math.max(1, Math.round(tile.display.bounds.width * scale));
    const destH = Math.max(1, Math.round(tile.display.bounds.height * scale));
    const destX = Math.round((tile.display.bounds.x - minX) * scale);
    const destY = Math.round((tile.display.bounds.y - minY) * scale);
    const resized = tile.image.resize({ width: destW, height: destH, quality: "best" });
    const src = resized.toBitmap();
    const srcSize = resized.getSize();
    blitBGRA(dest, canvasW, canvasH, src, srcSize.width, srcSize.height, destX, destY);
  }

  const png = nativeImage.createFromBitmap(dest, { width: canvasW, height: canvasH }).toPNG();
  if (!png.length) return null;
  return { buffer: png, width: canvasW, height: canvasH };
}

function blitBGRA(
  dest: Buffer,
  destW: number,
  destH: number,
  src: Buffer,
  srcW: number,
  srcH: number,
  dx: number,
  dy: number,
) {
  for (let row = 0; row < srcH; row++) {
    const y = dy + row;
    if (y < 0 || y >= destH) continue;
    let x = dx;
    let srcX = 0;
    let width = srcW;
    if (x < 0) {
      srcX = -x;
      width += x;
      x = 0;
    }
    if (x + width > destW) width = destW - x;
    if (width <= 0) continue;
    const srcOffset = (row * srcW + srcX) * 4;
    dest.set(src.subarray(srcOffset, srcOffset + width * 4), (y * destW + x) * 4);
  }
}
