/**
 * Main-process tracking loop — screenshots while the timer is running.
 * Capture lives in Electron main so it continues if the renderer is throttled.
 */
import { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import log from "electron-log/main";
import { ScreenshotService } from "../screenshots";
import { screenshotFilename } from "../screenshots/compress";
import { OfflineQueue } from "../offline/queue";
import { ActivityService } from "../activity";
import { InputActivityMonitor } from "../input-activity";
import { NotificationService } from "../notifications";
import { WindowRevealService } from "../window-reveal";

export type TrackingAuth = {
  accessToken: string;
  refreshToken?: string | null;
  organizationId: string;
  deviceId: string;
  sessionToken?: string | null;
  apiBaseUrl: string;
};

export type TrackingOptions = {
  screenshotIntervalMs: number;
  enableScreenshots: boolean;
  firstScreenshotDelayMs?: number;
  /** 0 = idle auto-pause disabled */
  idleTimeoutMs?: number;
};

export class TrackingService {
  private static instance: TrackingService | null = null;

  private running = false;
  private auth: TrackingAuth | null = null;
  private options: TrackingOptions = {
    screenshotIntervalMs: 5 * 60_000,
    enableScreenshots: true,
    firstScreenshotDelayMs: 3_000,
    idleTimeoutMs: 3 * 60_000,
  };
  private screenshotTimer: NodeJS.Timeout | null = null;
  private firstShotTimer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private capturing = false;
  private authWaiters: Array<(ok: boolean) => void> = [];
  private idlePauseInFlight = false;
  private scheduleRevealOnNextStart = false;
  private lastCaptureAt = 0;

  static getInstance(): TrackingService {
    if (!TrackingService.instance) {
      TrackingService.instance = new TrackingService();
    }
    return TrackingService.instance;
  }

  isRunning(): boolean {
    return this.running;
  }

  getAuth(): TrackingAuth | null {
    return this.auth;
  }

  async tryRefreshAccessToken(): Promise<boolean> {
    return this.refreshAccessToken();
  }

  updateAuth(auth: Partial<TrackingAuth>) {
    const next: TrackingAuth = this.auth ?? {
      accessToken: "",
      refreshToken: null,
      organizationId: "",
      deviceId: "desktop",
      sessionToken: null,
      apiBaseUrl: "http://localhost:3001",
    };

    if (auth.accessToken) next.accessToken = auth.accessToken;
    if (auth.refreshToken) next.refreshToken = auth.refreshToken;
    if (auth.organizationId) next.organizationId = auth.organizationId;
    if (auth.deviceId) next.deviceId = auth.deviceId;
    if (auth.sessionToken) next.sessionToken = auth.sessionToken;
    if (auth.apiBaseUrl) next.apiBaseUrl = auth.apiBaseUrl;

    this.auth = next;

    if (auth.accessToken) {
      const waiters = this.authWaiters.splice(0);
      waiters.forEach((resolve) => resolve(true));
    }
  }

  start(auth: TrackingAuth, options?: Partial<TrackingOptions>) {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    this.stopTimersOnly();
    this.updateAuth(auth);
    this.options = {
      screenshotIntervalMs: Math.max(60_000, options?.screenshotIntervalMs ?? 5 * 60_000),
      enableScreenshots: options?.enableScreenshots !== false,
      firstScreenshotDelayMs: options?.firstScreenshotDelayMs ?? 3_000,
      idleTimeoutMs:
        typeof options?.idleTimeoutMs === "number"
          ? Math.max(0, options.idleTimeoutMs)
          : 3 * 60_000,
    };
    this.running = true;
    this.idlePauseInFlight = false;

    ActivityService.getInstance().start();
    const idleMs = this.options.idleTimeoutMs ?? 0;
    InputActivityMonitor.getInstance().start(
      idleMs > 0 ? idleMs : 0,
      idleMs > 0
        ? () => {
            void this.handleIdleTimeout();
          }
        : null,
    );

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

    if (this.scheduleRevealOnNextStart) {
      this.scheduleRevealOnNextStart = false;
      const revealMs = Math.max(60_000, this.options.idleTimeoutMs ?? 5 * 60_000);
      WindowRevealService.getInstance().scheduleAfterResume(revealMs);
      log.info(
        `[TrackingService] window reveal scheduled after idle resume (${Math.round(revealMs / 1000)}s)`,
      );
    }

    return { ok: true, intervalMs: this.options.screenshotIntervalMs };
  }

  stop() {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
    }
    WindowRevealService.getInstance().cancel();
    // Survive React Strict Mode remounts and brief timer-sync blips.
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.running = false;
      this.stopTimersOnly();
      InputActivityMonitor.getInstance().stop();
      ActivityService.getInstance().stop();
      log.info("[TrackingService] stopped");
    }, 2000);
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
    activityPercent?: number;
  }> {
    if (!this.running || !this.auth) {
      return { ok: false, message: "Tracking not running" };
    }
    if (this.capturing) {
      return { ok: false, message: "Capture already in progress" };
    }

    this.capturing = true;
    try {
      let shot = await ScreenshotService.getInstance().capture();
      if (!shot?.buffer?.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        shot = await ScreenshotService.getInstance().capture();
      }
      if (!shot?.buffer?.length) {
        const message = "Screenshot capture failed";
        log.warn(`[TrackingService] ${message}`);
        this.emitToRenderer("screenshot:failed", { message });
        return { ok: false, message };
      }

      const win = await ActivityService.getInstance().getActiveWindow();
      const activityPercent = InputActivityMonitor.getInstance().consumePercent();
      log.info(`[TrackingService] uploading screenshot ${shot.buffer.length}B ${shot.mimeType}`);
      const uploaded = await this.uploadBuffer(shot.buffer, {
        timestamp: shot.capturedAt,
        appName: win.appName || "Desktop",
        windowTitle: win.windowTitle || "",
        mimeType: shot.mimeType || "image/jpeg",
        activityPercent,
      });

      if (!uploaded.ok) {
        if (uploaded.queued) {
          log.info("[TrackingService] screenshot queued offline");
          this.emitToRenderer("screenshot:queued", {
            message: uploaded.message,
          });
          return { ok: true, message: uploaded.message };
        }
        this.emitToRenderer("screenshot:failed", {
          message: uploaded.message,
        });
        return uploaded;
      }

      log.info(
        `[TrackingService] screenshot uploaded ${uploaded.id} (${uploaded.activityPercent ?? 0}% activity)`,
      );
      this.lastCaptureAt = Date.now();
      this.emitToRenderer("screenshot:uploaded", uploaded);
      return uploaded;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Screenshot upload failed";
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
      activityPercent: number;
    },
    persistOnFailure = true,
  ): Promise<{
    ok: boolean;
    queued?: boolean;
    message?: string;
    id?: string;
    url?: string;
    activityPercent?: number;
  }> {
    if (!this.auth?.accessToken || !this.auth.organizationId) {
      if (persistOnFailure) this.persistScreenshot(buffer, meta);
      return { ok: false, queued: true, message: "Saved offline" };
    }

    const post = async () => {
      const { body, contentType } = this.buildMultipartBody(buffer, meta);
      return fetch(`${this.auth!.apiBaseUrl.replace(/\/$/, "")}/screenshots/upload`, {
        method: "POST",
        headers: {
          ...this.buildAuthHeaders(),
          "Content-Type": contentType,
        },
        body,
      });
    };

    try {
      let response = await post();

      if (response.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          response = await post();
        }
      }

      const json = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        data?: { id?: string; url?: string; imageUrl?: string };
      } | null;

      if (!response.ok || !json?.success) {
        if (this.shouldQueueUpload(response.status)) {
          if (persistOnFailure) this.persistScreenshot(buffer, meta);
          return { ok: false, queued: true, message: "Saved offline" };
        }
        const message = json?.message || `Upload failed with status ${response.status}`;
        log.warn(`[TrackingService] upload failed: ${message}`);
        return { ok: false, message };
      }

      return {
        ok: true,
        id: json.data?.id,
        url: json.data?.url ?? json.data?.imageUrl,
        activityPercent: meta.activityPercent,
      };
    } catch (error) {
      log.warn("[TrackingService] upload network error — queueing", error);
      if (persistOnFailure) this.persistScreenshot(buffer, meta);
      return { ok: false, queued: true, message: "Saved offline" };
    }
  }

  async uploadScreenshotFile(
    filePath: string,
    meta: {
      timestamp: string;
      appName: string;
      windowTitle: string;
      mimeType: string;
      activityPercent: number;
    },
  ) {
    const buffer = await fs.promises.readFile(filePath);
    return this.uploadBuffer(buffer, meta, false);
  }

  private shouldQueueUpload(status: number): boolean {
    return status === 0 || status >= 500 || status === 408 || status === 429;
  }

  private persistScreenshot(
    buffer: Buffer,
    meta: {
      timestamp: string;
      appName: string;
      windowTitle: string;
      mimeType: string;
      activityPercent: number;
    },
  ) {
    try {
      const queue = OfflineQueue.getInstance();
      const ext = meta.mimeType === "image/jpeg" ? "jpg" : "png";
      const filePath = path.join(queue.screenshotDir(), `${Date.now()}-${process.pid}.${ext}`);
      fs.writeFileSync(filePath, buffer);
      queue.enqueueScreenshot({
        filePath,
        timestamp: meta.timestamp,
        appName: meta.appName,
        windowTitle: meta.windowTitle,
        mimeType: meta.mimeType,
        activityPercent: meta.activityPercent,
      });
      // Lazy import avoids a tracking ↔ sync cycle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { SyncService } = require("../sync") as typeof import("../sync");
      const sync = SyncService.getInstance();
      sync.schedule();
      sync.emitStatus();
    } catch (error) {
      log.error("[TrackingService] failed to persist screenshot offline", error);
    }
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth?.accessToken ?? ""}`,
      "x-organization-id": this.auth?.organizationId ?? "",
      "x-device-id": this.auth?.deviceId ?? "desktop",
      "x-device-type": "desktop",
    };
    if (this.auth?.sessionToken) {
      headers["x-session-token"] = this.auth.sessionToken;
    }
    return headers;
  }

  /** Raw multipart — more reliable than FormData/Blob in Electron main. */
  private buildMultipartBody(
    buffer: Buffer,
    meta: {
      timestamp: string;
      appName: string;
      windowTitle: string;
      mimeType: string;
      activityPercent: number;
    },
  ): { body: Uint8Array; contentType: string } {
    const boundary = `----Gr8rScreenshot${Date.now()}${process.pid}`;
    const chunks: Buffer[] = [];
    const pushField = (name: string, value: string) => {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    };
    pushField("timestamp", meta.timestamp);
    pushField("appName", meta.appName || "Desktop");
    if (meta.windowTitle) {
      pushField("windowTitle", meta.windowTitle);
    }
    pushField("deviceId", this.auth?.deviceId ?? "desktop");
    pushField("activityPercent", String(meta.activityPercent));
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${screenshotFilename(meta.mimeType)}"\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
      ),
    );
    chunks.push(buffer);
    chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    return {
      body: Buffer.concat(chunks),
      contentType: `multipart/form-data; boundary=${boundary}`,
    };
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.auth) return false;
    const previous = this.auth.accessToken;
    const base = this.auth.apiBaseUrl.replace(/\/$/, "");

    if (!this.auth.refreshToken) {
      log.warn("[TrackingService] no refresh token in main process");
    } else {
      try {
        const response = await fetch(`${base}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: this.auth.refreshToken }),
        });
        const json = (await response.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          data?: { access_token?: string };
        } | null;
        const nextToken = json?.data?.access_token;
        if (response.ok && nextToken) {
          this.auth.accessToken = nextToken;
          this.emitToRenderer("tracking:token-refreshed", {
            accessToken: nextToken,
          });
          log.info("[TrackingService] access token refreshed from main process");
          return true;
        }
        log.warn(
          `[TrackingService] main-process refresh failed: ${json?.message ?? response.status}`,
        );
      } catch (error) {
        log.warn("[TrackingService] main-process refresh error", error);
      }
    }

    this.emitToRenderer("tracking:auth-expired", {});
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.authWaiters = this.authWaiters.filter((waiter) => waiter !== onDone);
        resolve(false);
      }, 12_000);
      const onDone = (ok: boolean) => {
        clearTimeout(timer);
        resolve(ok && Boolean(this.auth?.accessToken && this.auth.accessToken !== previous));
      };
      this.authWaiters.push(onDone);
    });
  }

  private async handleIdleTimeout() {
    if (!this.running || this.idlePauseInFlight) return;
    this.idlePauseInFlight = true;
    this.stopTimersOnly();

    log.info(`[TrackingService] idle for one screenshot interval — pausing timer`);

    if (this.options.enableScreenshots) {
      const started = Date.now();
      while (this.capturing && Date.now() - started < 15_000) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!this.capturing && Date.now() - this.lastCaptureAt > 8_000) {
        await this.captureAndUpload();
      }
    }

    const idleMs = this.options.idleTimeoutMs ?? this.options.screenshotIntervalMs;
    const idleMinutes = Math.max(1, Math.round(idleMs / 60_000));

    const notifyResult = NotificationService.getInstance().showTimerIdlePaused(idleMinutes);
    if (!notifyResult.ok) {
      log.warn("[TrackingService] idle notification failed", notifyResult.message);
    }

    this.scheduleRevealOnNextStart = true;

    this.emitToRenderer("tracking:idle-timeout", {
      intervalMs: idleMs,
      activityPercent: InputActivityMonitor.getInstance().peekPercent(),
    });

    this.running = false;
    InputActivityMonitor.getInstance().stop();
    ActivityService.getInstance().stop();
  }

  private emitToRenderer(channel: string, payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}
