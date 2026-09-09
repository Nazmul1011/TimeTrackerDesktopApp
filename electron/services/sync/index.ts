/**
 * Flush the offline outbox: timer events (in order), then activity, then screenshots.
 */
import { BrowserWindow, net } from "electron";
import fs from "fs";
import log from "electron-log/main";
import { OfflineQueue, type TimerEventRow } from "../offline/queue";
import { TrackingService, type TrackingAuth } from "../tracking";

export type SyncStatus = {
  status: "idle" | "syncing" | "offline" | "error";
  lastSyncedAt: string | null;
  pending: { timer: number; activity: number; screenshots: number };
  message?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export class SyncService {
  private static instance: SyncService | null = null;
  private flushing = false;
  private scheduled: NodeJS.Timeout | null = null;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private interval: NodeJS.Timeout | null = null;

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  startPeriodicFlush() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      void this.run();
    }, 20_000);
  }

  stopPeriodicFlush() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  schedule(delayMs = 1200) {
    if (this.scheduled) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = null;
      void this.run();
    }, delayMs);
  }

  getStatus(): SyncStatus {
    const pending = OfflineQueue.getInstance().getPendingCounts();
    return {
      status: this.flushing
        ? "syncing"
        : this.lastError
          ? "error"
          : pending.timer + pending.activity + pending.screenshots > 0
            ? "offline"
            : "idle",
      lastSyncedAt: this.lastSyncedAt,
      pending,
      message: this.lastError ?? undefined,
    };
  }

  async run(): Promise<{ ok: boolean; message?: string; status: SyncStatus }> {
    if (this.flushing) {
      return { ok: true, message: "already running", status: this.getStatus() };
    }
    const auth = TrackingService.getInstance().getAuth();
    if (!auth?.accessToken || !auth.organizationId || !auth.apiBaseUrl) {
      return {
        ok: false,
        message: "Not signed in",
        status: this.getStatus(),
      };
    }
    if (!net.isOnline()) {
      return {
        ok: false,
        message: "offline",
        status: this.getStatus(),
      };
    }

    this.flushing = true;
    this.emitStatus();
    try {
      const timerResult = await this.flushTimerEvents(auth);
      if (!timerResult.ok && timerResult.network) {
        this.lastError = timerResult.message ?? "offline";
        return { ok: false, message: this.lastError, status: this.getStatus() };
      }
      const activityResult = await this.flushActivities(auth);
      if (!activityResult.ok && activityResult.network) {
        this.lastError = activityResult.message ?? "offline";
        return { ok: false, message: this.lastError, status: this.getStatus() };
      }
      const shotResult = await this.flushScreenshots();
      if (!shotResult.ok && shotResult.network) {
        this.lastError = shotResult.message ?? "offline";
        return { ok: false, message: this.lastError, status: this.getStatus() };
      }

      const ok = timerResult.ok && activityResult.ok && shotResult.ok;
      if (ok) {
        this.lastError = null;
        this.lastSyncedAt = new Date().toISOString();
      } else {
        this.lastError =
          timerResult.message ??
          activityResult.message ??
          shotResult.message ??
          "Sync incomplete";
      }
      const pending = OfflineQueue.getInstance().getPendingCounts();
      if (pending.timer + pending.activity + pending.screenshots === 0 && ok) {
        log.info("[SyncService] outbox empty");
      }
      return { ok, message: this.lastError ?? undefined, status: this.getStatus() };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Sync failed";
      this.lastError = message;
      log.warn("[SyncService] run failed", error);
      return { ok: false, message, status: this.getStatus() };
    } finally {
      this.flushing = false;
      this.emitStatus();
    }
  }

  private async flushTimerEvents(auth: TrackingAuth): Promise<{
    ok: boolean;
    network?: boolean;
    message?: string;
  }> {
    const queue = OfflineQueue.getInstance();
    const events = queue.listPendingTimerEvents();
    for (const event of events) {
      const result = await this.replayTimerEvent(auth, event);
      if (result.ok || result.skip) {
        queue.markTimerEventSynced(event.id);
        continue;
      }
      if (result.network) {
        return { ok: false, network: true, message: result.message };
      }
      log.warn(`[SyncService] timer event ${event.type} failed`, result.message);
      return { ok: false, message: result.message };
    }
    return { ok: true };
  }

  private async replayTimerEvent(
    auth: TrackingAuth,
    event: TimerEventRow,
  ): Promise<{ ok: boolean; skip?: boolean; network?: boolean; message?: string }> {
    const pathByType: Record<TimerEventRow["type"], string> = {
      start: "/timer/start",
      pause: "/timer/pause",
      resume: "/timer/resume",
      stop: "/timer/stop",
    };
    const body: Record<string, string> = {
      deviceId: auth.deviceId,
      occurredAt: event.occurredAt,
    };
    if (event.description) body.description = event.description;
    if (event.type === "start" && event.projectId) {
      body.projectId = event.projectId;
    }

    const response = await this.apiFetch(auth, pathByType[event.type], {
      method: "POST",
      body,
    });
    if (response.network) {
      return { ok: false, network: true, message: response.message };
    }
    if (response.status === 409 && event.type === "start") {
      const recovered = await this.recoverConflictingStart(auth, event, body);
      if (recovered.ok || recovered.skip) return recovered;
      return recovered;
    }
    if (response.status === 404 && (event.type === "pause" || event.type === "resume")) {
      return { ok: false, message: response.message ?? "timer not on server yet" };
    }
    if (response.status === 404 && event.type === "stop") {
      return { ok: true, skip: true };
    }
    if (response.ok) return { ok: true };
    return { ok: false, message: response.message };
  }

  /** Close the server timer, then replay the offline start so elapsed stays consistent. */
  private async recoverConflictingStart(
    auth: TrackingAuth,
    event: TimerEventRow,
    startBody: Record<string, string>,
  ): Promise<{ ok: boolean; skip?: boolean; network?: boolean; message?: string }> {
    log.info("[SyncService] start conflict — stopping server timer then replaying offline start");
    const stopOnce = await this.apiFetch(auth, "/timer/stop", {
      method: "POST",
      body: {
        deviceId: auth.deviceId,
        occurredAt: event.occurredAt,
        description: event.description ?? undefined,
      },
    });
    if (stopOnce.network) {
      return { ok: false, network: true, message: stopOnce.message };
    }
    if (!stopOnce.ok && stopOnce.status !== 404) {
      const stopNow = await this.apiFetch(auth, "/timer/stop", {
        method: "POST",
        body: { deviceId: auth.deviceId, description: event.description ?? undefined },
      });
      if (stopNow.network) {
        return { ok: false, network: true, message: stopNow.message };
      }
      if (!stopNow.ok && stopNow.status !== 404) {
        return { ok: false, message: stopNow.message ?? "Could not close existing timer" };
      }
    }

    const retry = await this.apiFetch(auth, "/timer/start", {
      method: "POST",
      body: startBody,
    });
    if (retry.network) {
      return { ok: false, network: true, message: retry.message };
    }
    if (retry.ok || retry.status === 409) {
      return { ok: true, skip: retry.status === 409 };
    }
    return { ok: false, message: retry.message };
  }

  private async flushActivities(auth: TrackingAuth): Promise<{
    ok: boolean;
    network?: boolean;
    message?: string;
  }> {
    const queue = OfflineQueue.getInstance();
    const batch = queue.listPendingActivities(80);
    if (!batch.length) return { ok: true };

    const response = await this.apiFetch(auth, "/activity/bulk", {
      method: "POST",
      body: { activities: batch.map((row) => row.payload) },
    });
    if (response.network) {
      return { ok: false, network: true, message: response.message };
    }
    if (!response.ok) {
      return { ok: false, message: response.message };
    }
    queue.markActivitiesSynced(batch.map((row) => row.id));
    return { ok: true };
  }

  private async flushScreenshots(): Promise<{
    ok: boolean;
    network?: boolean;
    message?: string;
  }> {
    const queue = OfflineQueue.getInstance();
    const tracking = TrackingService.getInstance();
    const rows = queue.listPendingScreenshots(6);
    for (const row of rows) {
      if (!fs.existsSync(row.filePath)) {
        log.warn("[SyncService] screenshot file missing, dropping", row.filePath);
        queue.markScreenshotSynced(row.id);
        continue;
      }
      const uploaded = await tracking.uploadScreenshotFile(row.filePath, {
        timestamp: row.timestamp,
        appName: row.appName || "Desktop",
        windowTitle: row.windowTitle || "",
        mimeType: row.mimeType || "image/jpeg",
        activityPercent: row.activityPercent ?? 0,
      });
      if (uploaded.ok) {
        queue.markScreenshotSynced(row.id);
        continue;
      }
      if (uploaded.queued) {
        return { ok: false, network: true, message: "offline" };
      }
      return { ok: false, message: uploaded.message };
    }
    return { ok: true };
  }

  private async apiFetch(
    auth: TrackingAuth,
    pathname: string,
    options: { method: string; body: unknown },
  ): Promise<{
    ok: boolean;
    status: number;
    network?: boolean;
    message?: string;
  }> {
    const url = `${auth.apiBaseUrl.replace(/\/$/, "")}${pathname}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      "x-organization-id": auth.organizationId,
      "x-device-id": auth.deviceId ?? "desktop",
      "x-device-type": "desktop",
    };
    if (auth.sessionToken) headers["x-session-token"] = auth.sessionToken;

    const send = (accessToken: string) =>
      fetch(url, {
        method: options.method,
        headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(options.body),
      });

    try {
      let response = await send(auth.accessToken);
      if (response.status === 401) {
        const refreshed = await TrackingService.getInstance().tryRefreshAccessToken();
        const nextAuth = TrackingService.getInstance().getAuth();
        if (refreshed && nextAuth?.accessToken) {
          response = await send(nextAuth.accessToken);
        }
      }
      const json = (await response.json().catch(() => null)) as ApiEnvelope<unknown> | null;
      if (response.status >= 500 || response.status === 429) {
        return {
          ok: false,
          status: response.status,
          network: true,
          message: json?.message ?? `HTTP ${response.status}`,
        };
      }
      return {
        ok: response.ok && json?.success !== false,
        status: response.status,
        message: json?.message,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        network: true,
        message: error instanceof Error ? error.message : "network error",
      };
    }
  }

  emitStatus() {
    const payload = this.getStatus();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("sync:status", payload);
      }
    }
  }
}
