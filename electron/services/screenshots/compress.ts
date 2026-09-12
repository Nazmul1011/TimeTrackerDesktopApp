/**
 * Compress captured screenshots to JPEG so uploads and stored files stay small.
 * Prefers Sharp; falls back to Electron nativeImage.toJPEG if Sharp is not
 * available (native module not rebuilt for this Electron ABI).
 */
import { nativeImage } from "electron";
import log from "electron-log/main";

export const SCREENSHOT_JPEG_QUALITY = 55;
export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_MIME = "image/jpeg" as const;

export type CompressedScreenshot = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: typeof SCREENSHOT_MIME;
};

export async function compressScreenshot(
  input: Buffer,
  originalWidth: number,
  originalHeight: number,
): Promise<CompressedScreenshot> {
  const viaSharp = await compressWithSharp(input);
  if (viaSharp) {
    log.info(
      `[ScreenshotService] sharp jpeg ${input.length} → ${viaSharp.buffer.length} bytes (${viaSharp.width}x${viaSharp.height})`,
    );
    return viaSharp;
  }

  return compressWithNativeImage(input, originalWidth, originalHeight);
}

async function compressWithSharp(input: Buffer): Promise<CompressedScreenshot | null> {
  try {
    const sharpMod = await import("sharp");
    const sharp = sharpMod.default;
    const buffer = await sharp(input)
      .rotate()
      .resize({
        width: SCREENSHOT_MAX_WIDTH,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: SCREENSHOT_JPEG_QUALITY,
        mozjpeg: true,
        progressive: true,
      })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return {
      buffer,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      mimeType: SCREENSHOT_MIME,
    };
  } catch (error) {
    log.warn("[ScreenshotService] sharp unavailable, using native JPEG", error);
    return null;
  }
}

function compressWithNativeImage(
  input: Buffer,
  originalWidth: number,
  originalHeight: number,
): CompressedScreenshot {
  const img = nativeImage.createFromBuffer(input);
  const size = img.getSize();
  const source =
    size.width > SCREENSHOT_MAX_WIDTH
      ? img.resize({ width: SCREENSHOT_MAX_WIDTH, quality: "good" })
      : img;
  const jpeg = Buffer.from(source.toJPEG(SCREENSHOT_JPEG_QUALITY));
  const out = source.getSize();
  log.info(
    `[ScreenshotService] jpeg fallback ${input.length} → ${jpeg.length} bytes (${out.width}x${out.height})`,
  );
  return {
    buffer: jpeg,
    width: out.width || originalWidth,
    height: out.height || originalHeight,
    mimeType: SCREENSHOT_MIME,
  };
}
