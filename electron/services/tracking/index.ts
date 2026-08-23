/**
 * Main-process tracking loop — screenshots while the timer is running.
 * Runs in Electron main so capture continues even if the renderer is throttled.
 */
import { BrowserWindow } from "electron";
import log from "electron-log/main";
import { ScreenshotService } from "../screenshots";
import { ActivityService } from "../activity";

export type TrackingAuth = {
  accessToken: string;
  organizationId: string;
  deviceId: string;
  sessionToken?: string | null;
  apiBaseUrl: string;
};

export type TrackingOptions = {
  screenshotIntervalMs: number;
  enableScreenshots: boolean;
  firstScreenshotDelayMs?: number;
};

export class TrackingService {
  private static instance: TrackingService | null = null;

  private running = false;
  private auth: TrackingAuth | null = null;
  private options: TrackingOptions = {
    screenshotIntervalMs: 60_000,
    enableScreenshots: true,
    firstScreenshotDelayMs: 3_000,
  };
  private screenshotTimer: NodeJS.Timeout | null = null;
  private firstShotTimer: NodeJS.Timeout | null = null;
  private capturing = false;

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  isRunning(): boolean {
    return this.running;
  }

  updateAuth(auth: Partial<TrackingAuth>) {
    if (!this.auth) {
      this.auth = {
        accessToken: auth.accessToken ?? "",
        organizationId: auth.organizationId ?? "",
        deviceId: auth.deviceId ?? "desktop",
        sessionToken: auth.sessionToken,
        apiBaseUrl: auth.apiBaseUrl ?? "http://localhost:3001",
      };
      return;
    }
    this.auth = { ...this.auth, ...auth };
  }

  start(auth: TrackingAuth, options?: Partial<TrackingOptions>) {
    this.stopTimersOnly();
    this.auth = auth;
    this.options = {
      screenshotIntervalMs: Math.max(
        15_000,
        options?.screenshotIntervalMs ?? 60_000,
      ),
      enableScreenshots: options?.enableScreenshots !== false,
      firstScreenshotDelayMs: options?.firstScreenshotDelayMs ?? 3_000,
    };
    this.running = true;

    ActivityService.getInstance().start();

    if (this.options.enableScreenshots) {
      this.firstShotTimer = setTimeout(() => {
        void this.captureAndUpload();
      }, this.options.firstScreenshotDelayMs);

      this.screenshotTimer = setInterval(() => {
        void this.captureAndUpload();
      }, this.options.screenshotIntervalMs);
    }

    log.info(
      `[TrackingService] started — screenshots every ${Math.round(this.options.screenshotIntervalMs / 1000)}s`,
    );
    return { ok: true, intervalMs: this.options.screenshotIntervalMs };
  }

  stop() {
    this.running = false;
    this.stopTimersOnly();
    ActivityService.getInstance().stop();
    log.info("[TrackingService] stopped");
    return { ok: true };
  }

  private stopTimersOnly() {
    if (this.screenshotTimer) {
      clearInterval(this.screenshotTimer);
      this.screenshotTimer = null;
    }
    if (this.firstShotTimer) {
      clearTimeout(this.firstShotTimer);
      this.firstShotTimer = null;
    }
  }

  async captureAndUpload(): Promise<{
    ok: boolean;
    message?: string;
    id?: string;
    url?: string;
  }> {
    if (!this.running || !this.auth) {
      return { ok: false, message: "Tracking not running" };
    }
    if (this.capturing) {
      return { ok: false, message: "Capture already in progress" };
    }

    this.capturing = true;
    try {
      const shot = await ScreenshotService.getInstance().capture();
      if (!shot?.buffer?.length) {
        const message = "Screenshot capture failed";
        log.warn(`[TrackingService] ${message}`);
        this.emitToRenderer("screenshot:failed", { message });
        return { ok: false, message };
      }

      const win = await ActivityService.getInstance().getActiveWindow();
      const uploaded = await this.uploadBuffer(shot.buffer, {
        timestamp: shot.capturedAt,
        appName: win.appName || "Desktop",
        windowTitle: win.windowTitle || "",
        mimeType: "image/png",
      });

      if (!uploaded.ok) {
        this.emitToRenderer("screenshot:failed", {
          message: uploaded.message,
        });
        return uploaded;
      }

      log.info(`[TrackingService] screenshot uploaded ${uploaded.id}`);
      this.emitToRenderer("screenshot:uploaded", uploaded);
      return uploaded;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Screenshot upload failed";
      log.error("[TrackingService] captureAndUpload error", error);
      this.emitToRenderer("screenshot:failed", { message });
      return { ok: false, message };
    } finally {
      this.capturing = false;
    }
  }

  private async uploadBuffer(
    buffer: Buffer,
    meta: {
      timestamp: string;
      appName: string;
      windowTitle: string;
      mimeType: string;
    },
  ): Promise<{ ok: boolean; message?: string; id?: string; url?: string }> {
    if (!this.auth?.accessToken || !this.auth.organizationId) {
      return { ok: false, message: "Missing auth for screenshot upload" };
    }

    const base = this.auth.apiBaseUrl.replace(/\/$/, "");
    const form = new FormData();
    const file = new File([new Uint8Array(buffer)], "screenshot.png", {
      type: meta.mimeType,
    });
    form.append("file", file);
    form.append("timestamp", meta.timestamp);
    form.append("appName", meta.appName || "Desktop");
    if (meta.windowTitle) {
      form.append("windowTitle", meta.windowTitle);
    }
    form.append("deviceId", this.auth.deviceId);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.accessToken}`,
      "x-organization-id": this.auth.organizationId,
      "x-device-id": this.auth.deviceId,
      "x-device-type": "desktop",
    };
    if (this.auth.sessionToken) {
      headers["x-session-token"] = this.auth.sessionToken;
    }

    let response = await fetch(`${base}/screenshots/upload`, {
      method: "POST",
      headers,
      body: form,
    });

    // One refresh attempt on 401
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.auth.accessToken}`;
        // Rebuild form — body can only be consumed once
        const retryForm = new FormData();
        const retryFile = new File([new Uint8Array(buffer)], "screenshot.png", {
          type: meta.mimeType,
        });
        retryForm.append("file", retryFile);
        retryForm.append("timestamp", meta.timestamp);
        retryForm.append("appName", meta.appName || "Desktop");
        if (meta.windowTitle) {
          retryForm.append("windowTitle", meta.windowTitle);
        }
        retryForm.append("deviceId", this.auth.deviceId);
        response = await fetch(`${base}/screenshots/upload`, {
          method: "POST",
          headers,
          body: retryForm,
        });
      }
    }

    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: { id?: string; url?: string };
    } | null;

    if (!response.ok || !json?.success) {
      const message =
        json?.message || `Upload failed with status ${response.status}`;
      log.warn(`[TrackingService] upload failed: ${message}`);
      return { ok: false, message };
    }

    return {
      ok: true,
      id: json.data?.id,
      url: json.data?.url,
    };
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.auth) return false;
    // Renderer owns refresh tokens in localStorage — ask it to push a new token
    this.emitToRenderer("tracking:auth-expired", {});
    return false;
  }

  private emitToRenderer(channel: string, payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}
