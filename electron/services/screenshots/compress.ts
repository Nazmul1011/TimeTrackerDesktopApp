/**
 * Compress captured screenshots to JPEG before upload.
 * Target payload: at most 300 KB (typically 100–300 KB).
 */
import log from "electron-log/main";

export const SCREENSHOT_MAX_BYTES = 300 * 1024;
export const SCREENSHOT_TARGET_BYTES = 200 * 1024;
export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_JPEG_MIME = "image/jpeg" as const;

export type CompressedScreenshot = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: typeof SCREENSHOT_JPEG_MIME;
  originalBytes: number;
  quality: number;
};

const QUALITY_HIGH = 80;
const QUALITY_START = 72;
const QUALITY_LOW = 40;
const WIDTH_FLOOR = 800;

async function getSharp() {
  return (await import("sharp")).default;
}

export async function compressScreenshot(
  input: Buffer,
): Promise<CompressedScreenshot> {
  if (!input?.length) {
    throw new Error("Screenshot buffer is empty");
  }

  try {
    return await compressWithSharp(input);
  } catch (error) {
    log.warn(
      "[ScreenshotCompress] sharp failed, using nativeImage fallback",
      error,
    );
    return compressWithNativeImage(input);
  }
}

export async function compressWithSharp(
  input: Buffer,
): Promise<CompressedScreenshot> {
  const sharp = await getSharp();
  const originalBytes = input.length;
  const meta = await sharp(input, { failOn: "none" }).rotate().metadata();
  const srcWidth = meta.width ?? SCREENSHOT_MAX_WIDTH;

  const widths = buildWidthLadder(srcWidth);
  let smallest: CompressedScreenshot | null = null;

  for (const width of widths) {
    const encoded = await encodeAtWidth(input, width, originalBytes);
    if (
      !smallest ||
      encoded.buffer.length < smallest.buffer.length
    ) {
      smallest = encoded;
    }
    if (encoded.buffer.length <= SCREENSHOT_MAX_BYTES) {
      log.info(
        `[ScreenshotCompress] ${originalBytes}B → ${encoded.buffer.length}B ` +
          `(${encoded.width}x${encoded.height} q=${encoded.quality})`,
      );
      return encoded;
    }
  }

  if (!smallest) {
    throw new Error("Screenshot compression produced an empty buffer");
  }

  log.warn(
    `[ScreenshotCompress] could not reach ${SCREENSHOT_MAX_BYTES}B; ` +
      `sending smallest ${smallest.buffer.length}B`,
  );
  return smallest;
}

function buildWidthLadder(srcWidth: number): number[] {
  const start = Math.min(Math.max(srcWidth, 1), SCREENSHOT_MAX_WIDTH);
  const candidates = [start, 1120, 960, WIDTH_FLOOR].filter(
    (width) => width > 0 && width <= start,
  );
  return [...new Set(candidates)];
}

async function encodeAtWidth(
  input: Buffer,
  width: number,
  originalBytes: number,
): Promise<CompressedScreenshot> {
  const probe = await encodeJpeg(input, width, QUALITY_START, originalBytes);
  if (probe.buffer.length <= SCREENSHOT_MAX_BYTES) {
    if (probe.buffer.length >= SCREENSHOT_TARGET_BYTES * 0.5) {
      return probe;
    }
    const richer = await encodeJpeg(input, width, QUALITY_HIGH, originalBytes);
    return richer.buffer.length <= SCREENSHOT_MAX_BYTES ? richer : probe;
  }

  let low = QUALITY_LOW;
  let high = QUALITY_START - 1;
  let bestFit: CompressedScreenshot | null = null;
  let smallest = probe;

  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const encoded = await encodeJpeg(input, width, quality, originalBytes);
    if (encoded.buffer.length < smallest.buffer.length) {
      smallest = encoded;
    }
    if (encoded.buffer.length <= SCREENSHOT_MAX_BYTES) {
      bestFit = encoded;
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  return bestFit ?? smallest;
}

async function encodeJpeg(
  input: Buffer,
  width: number,
  quality: number,
  originalBytes: number,
): Promise<CompressedScreenshot> {
  const sharp = await getSharp();
  const buffer = await sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width,
      withoutEnlargement: true,
      fit: "inside",
    })
    .jpeg({
      quality,
      mozjpeg: true,
      chromaSubsampling: "4:2:0",
      trellisQuantisation: true,
      overshootDeringing: true,
      optimizeScans: true,
    })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? width,
    height: meta.height ?? 0,
    mimeType: SCREENSHOT_JPEG_MIME,
    originalBytes,
    quality,
  };
}

function compressWithNativeImage(input: Buffer): CompressedScreenshot {
  // Lazy-load so Node-only verification does not need Electron.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { nativeImage } = require("electron") as typeof import("electron");
  const originalBytes = input.length;
  let image = nativeImage.createFromBuffer(input);
  let { width, height } = image.getSize();

  if (!width || !height) {
    throw new Error("nativeImage could not decode screenshot");
  }

  if (width > SCREENSHOT_MAX_WIDTH) {
    height = Math.max(1, Math.round((height * SCREENSHOT_MAX_WIDTH) / width));
    width = SCREENSHOT_MAX_WIDTH;
    image = image.resize({ width, height, quality: "best" });
  }

  const qualities = [QUALITY_HIGH, QUALITY_START, 64, 56, 48, QUALITY_LOW];
  let smallest: CompressedScreenshot | null = null;

  const tryWidths = [width];
  if (width > WIDTH_FLOOR) {
    tryWidths.push(1120, 960, WIDTH_FLOOR);
  }

  for (const nextWidth of tryWidths) {
    if (nextWidth <= 0 || nextWidth > width) continue;
    if (nextWidth !== image.getSize().width) {
      const nextHeight = Math.max(
        1,
        Math.round((height * nextWidth) / width),
      );
      image = nativeImage.createFromBuffer(input).resize({
        width: nextWidth,
        height: nextHeight,
        quality: "good",
      });
    }
    const size = image.getSize();
    for (const quality of qualities) {
      const buffer = Buffer.from(image.toJPEG(quality));
      const encoded: CompressedScreenshot = {
        buffer,
        width: size.width,
        height: size.height,
        mimeType: SCREENSHOT_JPEG_MIME,
        originalBytes,
        quality,
      };
      if (!smallest || buffer.length < smallest.buffer.length) {
        smallest = encoded;
      }
      if (buffer.length <= SCREENSHOT_MAX_BYTES) {
        log.info(
          `[ScreenshotCompress] nativeImage ${originalBytes}B → ${buffer.length}B ` +
            `(${size.width}x${size.height} q=${quality})`,
        );
        return encoded;
      }
    }
  }

  if (!smallest) {
    throw new Error("nativeImage compression produced an empty buffer");
  }
  return smallest;
}

export function screenshotFilename(mimeType: string): string {
  return mimeType === SCREENSHOT_JPEG_MIME ? "screenshot.jpg" : "screenshot.png";
}
