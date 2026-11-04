/**
 * Main-process tracking loop — screenshots while the timer is running.
 * Capture lives in Electron main so it continues if the renderer is throttled.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { app, BrowserWindow } from "electron";
import log from "electron-log/main";
import {
  ackOutbox,
  countScreenshotFiles,
  enqueueOutbox,
  listOutbox,
  offlineScreenshotDir,
} from "../../database/outbox";
import { ScreenshotService } from "../screenshots";
import { ActivityService } from "../activity";
import { InputActivityMonitor } from "../input-activity";
import { IdleService } from "../idle";
import { NotificationService } from "../notifications";
import { WindowRevealService } from "../window-reveal";
import { setTrayTimerStatus } from "../../main/tray";
import { MacPermissions } from "../mac-permissions";
import { getMainApiBaseUrl } from "../../api-url";

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

/**
 * How often the main process tells the server the timer's machine is alive.
 * The server auto-stops a running timer after 5 minutes of silence, so this
 * must keep firing even when the window is hidden and the renderer throttled.
 */
const HEARTBEAT_MS = 60_000;
const REFRESH_TIMEOUT_MS = 8_000;
const UPLOAD_TIMEOUT_MS = 4_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const IDLE_RESUME_GUARD_MS = 60_000;

export class TrackingService {
  private static instance: TrackingService | null = null;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatInFlight = false;

  private running = false;
  private auth: TrackingAuth | null = null;
  private options: TrackingOptions = {
    screenshotIntervalMs: 5 * 60_000,
    enableScreenshots: true,
    firstScreenshotDelayMs: 3_000,
    idleTimeoutMs: 2 * 60_000,
  };
  private screenshotTimer: NodeJS.Timeout | null = null;
  private firstShotTimer: NodeJS.Timeout | null = null;
  private stopTimer: NodeJS.Timeout | null = null;
  private capturing = false;
  private authWaiters: Array<(ok: boolean) => void> = [];
  private idlePauseInFlight = false;
  /** After idle auto-pause, wait for mouse/keyboard then resume (not manual Pause). */
  private awaitingIdleResume = false;
  private idleResumeTimer: NodeJS.Timeout | null = null;
  private idleResumeGuard: NodeJS.Timeout | null = null;
  private lastIdleResumeEmitAt = 0;
  private lastCaptureAt = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushingShots = false;

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
    const next: TrackingAuth = this.auth ?? {
      accessToken: "",
      refreshToken: null,
      organizationId: "",
      deviceId: "desktop",
      sessionToken: null,
      apiBaseUrl: getMainApiBaseUrl(),
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
      this.ensureScreenshotFlushLoop();
    }
  }

  start(auth: TrackingAuth, options?: Partial<TrackingOptions>) {
    if (this.awaitingIdleResume) {
      log.info("[TrackingService] start ignored — waiting for idle auto-resume");
      this.updateAuth(auth);
      return { ok: true, intervalMs: this.options.screenshotIntervalMs };
    }

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }

    this.stopTimersOnly();
    this.updateAuth(auth);
    MacPermissions.clearCaptureBlock();
    ScreenshotService.getInstance().resetWarnings();
    this.options = {
      screenshotIntervalMs: Math.max(60_000, options?.screenshotIntervalMs ?? 5 * 60_000),
      enableScreenshots: options?.enableScreenshots !== false,
      firstScreenshotDelayMs: options?.firstScreenshotDelayMs ?? 3_000,
      idleTimeoutMs:
        typeof options?.idleTimeoutMs === "number"
          ? Math.max(0, options.idleTimeoutMs)
          : 1 * 60_000,
    };
    this.running = true;
    this.idlePauseInFlight = false;
    this.disarmIdleResume("tracking started");
    this.startHeartbeat();

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
      void this.startScreenshotLoopWhenAllowed();
    }

    log.info(
      `[TrackingService] started — screenshots every ${Math.round(this.options.screenshotIntervalMs / 1000)}s`,
    );

    return { ok: true, intervalMs: this.options.screenshotIntervalMs };
  }

  retryScreenshots() {
    MacPermissions.clearCaptureBlock();
    ScreenshotService.getInstance().resetWarnings();
    if (!this.running || !this.options.enableScreenshots) {
      return { ok: false, message: "Start the timer first" };
    }
    this.stopTimersOnly();
    void this.startScreenshotLoopWhenAllowed();
    log.info("[TrackingService] screenshot capture retried");
    return { ok: true };
  }

  stop() {
    if (this.awaitingIdleResume) {
      log.info("[TrackingService] stop ignored — waiting for idle auto-resume");
      return { ok: true };
    }

    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
    }
    WindowRevealService.getInstance().cancel();
    // Survive React Strict Mode remounts and brief timer-sync blips.
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      this.running = false;
      this.stopTimersOnly();
      this.stopHeartbeat();
      InputActivityMonitor.getInstance().stop();
      ActivityService.getInstance().stop();
      if (this.awaitingIdleResume) {
        this.startIdleResumeWatch();
      } else {
        this.clearIdleResumeWatch();
      }
      log.info("[TrackingService] stopped");
    }, 2000);
    return { ok: true };
  }

  private screenshotLoopGen = 0;

  private async startScreenshotLoopWhenAllowed(): Promise<void> {
    const gen = this.screenshotLoopGen;
    if (process.platform === "darwin") {
      const ok = await MacPermissions.requestScreenRecordingOnce();
      if (!ok) {
        log.warn(
          "[TrackingService] Screen Recording not granted — screenshots paused until you enable Gr8r Time Tracker in System Settings and fully quit the app",
        );
        this.emitToRenderer("screenshot:failed", {
          message: "Screen Recording not granted",
        });
        return;
      }
    }
    if (gen !== this.screenshotLoopGen || !this.running || !this.options.enableScreenshots) {
      return;
    }
    this.firstShotTimer = setTimeout(() => {
      void this.captureAndUpload().finally(() => {
        if (gen !== this.screenshotLoopGen || !this.running || !this.options.enableScreenshots) {
          return;
        }
        this.screenshotTimer = setInterval(() => {
          void this.captureAndUpload();
        }, this.options.screenshotIntervalMs);
      });
    }, this.options.firstScreenshotDelayMs);
  }

  private stopTimersOnly() {
    this.screenshotLoopGen += 1;
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
      if (!shot?.buffer?.length && process.platform !== "darwin") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        shot = await ScreenshotService.getInstance().capture();
      }
      if (!shot?.buffer?.length) {
        if (process.platform === "darwin") {
          MacPermissions.markCaptureFailed();
          this.stopTimersOnly();
          const message = "Screen Recording not granted";
          log.warn(
            "[TrackingService] capture failed — screenshots paused until Screen Recording is on and the app is fully quit",
          );
          this.emitToRenderer("screenshot:failed", { message });
          return { ok: false, message };
        }
        const message = "Screenshot capture failed";
        log.warn(`[TrackingService] ${message}`);
        this.emitToRenderer("screenshot:failed", { message });
        return { ok: false, message };
      }

      const win = await ActivityService.getInstance().getActiveWindow();
      const activityPercent = InputActivityMonitor.getInstance().consumePercent();
      const uploaded = await this.uploadBuffer(shot.buffer, {
        timestamp: shot.capturedAt,
        appName: win.appName || "Desktop",
        windowTitle: win.windowTitle || "",
        mimeType: shot.mimeType ?? "image/jpeg",
        activityPercent,
      });

      if (!uploaded.ok) {
        const mimeType = shot.mimeType ?? "image/jpeg";
        const localId = uploaded.retryable
          ? this.queueScreenshot(shot.buffer, {
              timestamp: shot.capturedAt,
              appName: win.appName || "Desktop",
              windowTitle: win.windowTitle || "",
              mimeType,
              activityPercent,
            })
          : null;
        if (localId != null) {
          log.info("[TrackingService] screenshot saved locally until the server is reachable");
          const saved = {
            id: `local-${localId}`,
            url: `data:${mimeType};base64,${shot.buffer.toString("base64")}`,
            activityPercent,
            capturedAt: shot.capturedAt,
            appName: win.appName || "Desktop",
          };
          this.lastCaptureAt = Date.now();
          this.emitToRenderer("screenshot:uploaded", saved);
          return { ok: true, message: "Saved offline", ...saved };
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
  ): Promise<{
    ok: boolean;
    message?: string;
    id?: string;
    url?: string;
    activityPercent?: number;
    retryable?: boolean;
  }> {
    if (!this.auth?.accessToken || !this.auth.organizationId) {
      return { ok: false, message: "Missing auth for screenshot upload" };
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
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
    };

    let response: Response;
    try {
      response = await post();
    } catch (error) {
      log.warn("[TrackingService] upload failed", error);
      return { ok: false, retryable: true, message: "Network error" };
    }

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        try {
          response = await post();
        } catch (error) {
          log.warn("[TrackingService] upload failed", error);
          return { ok: false, retryable: true, message: "Network error" };
        }
      }
    }

    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: { id?: string; url?: string; imageUrl?: string };
    } | null;

    if (!response.ok || !json?.success) {
      const message = json?.message || `Upload failed with status ${response.status}`;
      const retryable =
        response.status === 0 ||
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      log.warn(`[TrackingService] upload failed: ${message}`);
      return { ok: false, retryable, message };
    }

    return {
      ok: true,
      id: json.data?.id,
      url: json.data?.url ?? json.data?.imageUrl,
      activityPercent: meta.activityPercent,
    };
  }

  private queueScreenshot(
    buffer: Buffer,
    meta: {
      timestamp: string;
      appName: string;
      windowTitle: string;
      mimeType: string;
      activityPercent: number;
    },
  ): number | null {
    if (countScreenshotFiles() >= 200) {
      log.warn("[TrackingService] offline screenshot folder is full");
      return null;
    }
    try {
      const filePath = path.join(offlineScreenshotDir(), `${randomUUID()}.jpg`);
      fs.writeFileSync(filePath, buffer);
      const id = enqueueOutbox("screenshot", { ...meta, filePath });
      if (id == null) {
        fs.unlinkSync(filePath);
        return null;
      }
      return id;
    } catch (error) {
      log.warn("[TrackingService] could not store screenshot offline", error);
      return null;
    }
  }

  private ensureScreenshotFlushLoop(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flushQueuedScreenshots();
    }, 20_000);
  }

  async flushQueuedScreenshots(): Promise<{ ok: boolean; uploaded: number }> {
    if (this.flushingShots || !this.auth?.accessToken) return { ok: false, uploaded: 0 };
    this.flushingShots = true;
    let uploaded = 0;
    try {
      const rows = listOutbox("screenshot");
      for (const row of rows) {
        const payload = row.payload as {
          filePath?: string;
          timestamp?: string;
          appName?: string;
          windowTitle?: string;
          mimeType?: string;
          activityPercent?: number;
        };
        if (!payload.filePath || !fs.existsSync(payload.filePath)) {
          ackOutbox([row.id]);
          continue;
        }
        const result = await this.uploadBuffer(fs.readFileSync(payload.filePath), {
          timestamp: payload.timestamp || new Date().toISOString(),
          appName: payload.appName || "Desktop",
          windowTitle: payload.windowTitle || "",
          mimeType: payload.mimeType || "image/jpeg",
          activityPercent: payload.activityPercent ?? 0,
        });
        if (result.ok) {
          uploaded += 1;
          fs.unlinkSync(payload.filePath);
          ackOutbox([row.id]);
          this.emitToRenderer("screenshot:uploaded", result);
          continue;
        }
        if (!result.retryable) {
          ackOutbox([row.id]);
          fs.unlinkSync(payload.filePath);
          continue;
        }
        break;
      }
      return { ok: true, uploaded };
    } catch (error) {
      log.warn("[TrackingService] screenshot flush failed", error);
      return { ok: false, uploaded };
    } finally {
      this.flushingShots = false;
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
  ): { body: Buffer<ArrayBuffer>; contentType: string } {
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
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="screenshot.jpg"\r\nContent-Type: ${meta.mimeType}\r\n\r\n`,
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
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
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

    const idleMs = this.options.idleTimeoutMs ?? this.options.screenshotIntervalMs;

    log.info(`[TrackingService] idle for one screenshot interval — pausing timer`);
    setTrayTimerStatus("paused");

    if (this.options.enableScreenshots) {
      const started = Date.now();
      while (this.capturing && Date.now() - started < 15_000) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (!this.capturing && Date.now() - this.lastCaptureAt > 8_000) {
        await this.captureAndUpload();
      }
    }

    NotificationService.getInstance().showTimerIdlePaused(idleMs);

    this.running = false;
    // The timer is about to be paused; a paused timer is never auto-stopped.
    this.stopHeartbeat();
    this.awaitingIdleResume = true;
    InputActivityMonitor.getInstance().stop();
    ActivityService.getInstance().stop();
    this.startIdleResumeWatch();

    this.emitToRenderer("tracking:idle-timeout", {
      intervalMs: idleMs,
      activityPercent: InputActivityMonitor.getInstance().peekPercent(),
    });
  }

  /**
   * Cancel auto-resume (Stop, logout, a manual Pause or Resume). The reason is
   * logged so a missed auto-resume can be traced.
   */
  disarmIdleResume(reason = "not given") {
    if (this.awaitingIdleResume) {
      log.info(`[TrackingService] idle auto-resume cancelled — ${reason}`);
    }
    this.awaitingIdleResume = false;
    this.lastIdleResumeEmitAt = 0;
    this.clearIdleResumeWatch();
    this.clearIdleResumeGuard();
  }

  /**
   * The window still shows an idle pause: make sure the watcher is on. Does
   * nothing while tracking runs, or when the watcher is already healthy.
   */
  armIdleResume(reason = "not given") {
    if (this.running) return { ok: false, armed: false };
    if (this.awaitingIdleResume && this.idleResumeWatchHealthy()) {
      return { ok: true, armed: true };
    }
    log.info(`[TrackingService] idle auto-resume re-armed — ${reason}`);
    this.awaitingIdleResume = true;
    this.startIdleResumeWatch();
    return { ok: true, armed: true };
  }

  private idleResumeWatchHealthy(): boolean {
    return this.idleResumeTimer !== null && IdleService.getInstance().isWatching();
  }

  private startIdleResumeWatch() {
    this.clearIdleResumeWatch();
    this.ensureIdleResumeGuard();
    IdleService.getInstance().startWatching();
    // Capture after startWatching so the seed lastInputAt is not treated as the user coming back.
    const baseline = Date.now();
    this.idleResumeTimer = setInterval(() => {
      if (!this.awaitingIdleResume) return;
      if (!IdleService.getInstance().inputOccurredAfter(baseline)) return;
      this.fireIdleResume();
    }, 250);
    log.info("[TrackingService] watching for mouse/keyboard to auto-resume after idle pause");
  }

  private fireIdleResume() {
    if (!this.awaitingIdleResume) return;
    this.awaitingIdleResume = false;
    this.clearIdleResumeWatch();
    this.clearIdleResumeGuard();
    this.lastIdleResumeEmitAt = Date.now();
    log.info("[TrackingService] input after idle pause — requesting timer resume");
    setTrayTimerStatus("running");
    NotificationService.getInstance().showTimerIdleResumed();
    this.emitToRenderer("tracking:idle-resume", {
      resumedAt: new Date().toISOString(),
    });
  }

  private clearIdleResumeWatch() {
    if (this.idleResumeTimer) {
      clearInterval(this.idleResumeTimer);
      this.idleResumeTimer = null;
    }
  }

  /** Once a minute while waiting: if the watcher died, start it again. */
  private ensureIdleResumeGuard() {
    if (this.idleResumeGuard) return;
    this.idleResumeGuard = setInterval(() => {
      if (!this.awaitingIdleResume || this.running) return;
      if (this.idleResumeWatchHealthy()) return;
      log.warn("[TrackingService] idle auto-resume watcher was off — restarting it");
      this.startIdleResumeWatch();
    }, IDLE_RESUME_GUARD_MS);
  }

  private clearIdleResumeGuard() {
    if (this.idleResumeGuard) {
      clearInterval(this.idleResumeGuard);
      this.idleResumeGuard = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Failures only log: one missed beat is fine, the server allows five. */
  private async sendHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight) return;
    if (!this.auth?.accessToken || !this.auth.organizationId) return;
    this.heartbeatInFlight = true;
    try {
      const post = () =>
        fetch(`${this.auth!.apiBaseUrl.replace(/\/$/, "")}/activity/heartbeat`, {
          method: "POST",
          headers: {
            ...this.buildAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: this.auth!.deviceId,
            version: app.getVersion(),
          }),
          signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
        });

      let response = await post();
      if (response.status === 401 && (await this.refreshAccessToken())) {
        response = await post();
      }
      if (!response.ok) {
        log.warn(`[TrackingService] heartbeat rejected: ${response.status}`);
      }
    } catch (error) {
      log.warn("[TrackingService] heartbeat failed", error);
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  private emitToRenderer(channel: string, payload: unknown) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}
