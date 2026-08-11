/**
 * Screenshot capture via Electron desktopCapturer (main process).
 */
import { desktopCapturer, screen } from "electron";
import log from "electron-log/main";

export type CapturedScreenshot = {
  buffer: Buffer;
  width: number;
  height: number;
  capturedAt: string;
};

export class ScreenshotService {
  private static instance: ScreenshotService | null = null;

  static getInstance(): ScreenshotService {
    if (!ScreenshotService.instance) {
      ScreenshotService.instance = new ScreenshotService();
    }
    return ScreenshotService.instance;
  }

  async capture(): Promise<CapturedScreenshot | null> {
    try {
      const primary = screen.getPrimaryDisplay();
      const { width, height } = primary.size;
      const scale = primary.scaleFactor || 1;

      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.floor(width * scale),
          height: Math.floor(height * scale),
        },
      });

      const source =
        sources.find((s) => s.display_id === String(primary.id)) || sources[0];

      if (!source?.thumbnail || source.thumbnail.isEmpty()) {
        log.warn("[ScreenshotService] No screen source available");
        return null;
      }

      const png = source.thumbnail.toPNG();
      return {
        buffer: png,
        width: source.thumbnail.getSize().width,
        height: source.thumbnail.getSize().height,
        capturedAt: new Date().toISOString(),
      };
    } catch (error) {
      log.error("[ScreenshotService] capture failed", error);
      return null;
    }
  }

  async list(): Promise<unknown[]> {
    return [];
  }
}
