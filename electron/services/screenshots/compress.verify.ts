/**
 * Standalone check: compress a noisy full-HD PNG and assert it is ≤ 300 KB.
 * Run after `npm run electron:compile`.
 */
import { randomFillSync } from "crypto";
import sharp from "sharp";
import {
  compressWithSharp,
  SCREENSHOT_MAX_BYTES,
} from "./compress";

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function makeNoisyPng(
  width: number,
  height: number,
): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  randomFillSync(pixels);
  return sharp(pixels, {
    raw: { width, height, channels: 3 },
  })
    .png({ compressionLevel: 1 })
    .toBuffer();
}

async function makeUiLikePng(
  width: number,
  height: number,
): Promise<Buffer> {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#1e1e2e"/>
      <rect x="0" y="0" width="72" height="100%" fill="#11111b"/>
      <rect x="72" y="0" width="${width - 72}" height="48" fill="#313244"/>
      <rect x="96" y="80" width="${width - 160}" height="220" fill="#45475a" rx="8"/>
      <rect x="96" y="320" width="${Math.floor((width - 160) * 0.6)}" height="420" fill="#585b70" rx="8"/>
      <text x="96" y="64" fill="#cdd6f4" font-size="22" font-family="sans-serif">Time Tracker</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function assertCompressed(label: string, input: Buffer) {
  const result = await compressWithSharp(input);
  const withinMax = result.buffer.length <= SCREENSHOT_MAX_BYTES;
  console.log(
    `${label}: ${kb(input.length)} → ${kb(result.buffer.length)} ` +
      `(${result.width}x${result.height} q=${result.quality} ${result.mimeType}) ` +
      `${withinMax ? "OK" : "FAIL"}`,
  );
  if (!withinMax) {
    throw new Error(
      `${label} compressed to ${result.buffer.length} bytes; max is ${SCREENSHOT_MAX_BYTES}`,
    );
  }
  if (result.mimeType !== "image/jpeg") {
    throw new Error(`${label} mime type is ${result.mimeType}, expected image/jpeg`);
  }
}

async function main() {
  const noisy = await makeNoisyPng(1920, 1080);
  const ui = await makeUiLikePng(1920, 1080);
  await assertCompressed("noisy-1080p", noisy);
  await assertCompressed("ui-1080p", ui);
  console.log("screenshot compression verified");
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
