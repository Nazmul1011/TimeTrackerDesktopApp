/**
 * Desktop tracking agent — activity sampling in renderer;
 * screenshots run in Electron main while the timer is running.
 */
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { activityApi } from "@/services/api/activity.api";
import { monitoringApi, type MonitoringConfig } from "@/services/api/monitoring.api";
import { ensureDeviceId, getApiBaseUrl } from "@/services/api/client";
import { STORAGE_KEYS } from "@/constants/storage";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

type Sample = {
  timestamp: string;
  appName: string;
  windowTitle?: string;
  duration: number;
  isIdle: boolean;
  deviceId: string;
};

const ACTIVITY_SAMPLE_MS = 10_000;
const HEARTBEAT_MS = 60_000;
const FLUSH_MS = 30_000;
const IDLE_THRESHOLD_SEC = 180;
const FIRST_SCREENSHOT_MS = 3_000;

export const SCREENSHOT_CAPTURED_EVENT = "gr8r:screenshot-captured";

function resolveScreenshotIntervalMs(cfg: MonitoringConfig | null): number {
  const envSeconds = Number(
    process.env.NEXT_PUBLIC_SCREENSHOT_INTERVAL_SEC ?? "",
  );
  if (Number.isFinite(envSeconds) && envSeconds > 0) {
    return Math.max(15, envSeconds) * 1000;
  }

  if (process.env.NEXT_PUBLIC_APP_ENV !== "production") {
    return 60_000;
  }

  const minutes = Math.max(1, Number(cfg?.screenshotInterval ?? 10));
  return minutes * 60_000;
}

export function useTrackingAgent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const tokens = useAuthStore((s) => s.tokens);
  const timerStatus = useTimerStore((s) => s.timer.status);

  const queueRef = useRef<Sample[]>([]);
  const lastSampleRef = useRef<{
    appName: string;
    windowTitle: string;
    isIdle: boolean;
    at: number;
  } | null>(null);
  const configRef = useRef<MonitoringConfig | null>(null);
  const firstUploadToastRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;

    let cancelled = false;
    void monitoringApi
      .getConfig()
      .then((cfg) => {
        if (!cancelled) configRef.current = cfg;
      })
      .catch(() => {
        if (!cancelled) {
          configRef.current = {
            activityMonitoringEnabled: true,
            screenshotEnabled: true,
            screenshotInterval: 1,
          };
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, organizationId]);

  // Keep main-process auth in sync (token refresh)
  useEffect(() => {
    if (!isElectron() || !tokens.accessToken || !organizationId) return;
    const api = getElectronAPI();
    if (!api?.tracking) return;
    void api.tracking.updateAuth({
      accessToken: tokens.accessToken,
      organizationId,
      deviceId: ensureDeviceId(),
      sessionToken: tokens.sessionToken,
      apiBaseUrl: getApiBaseUrl(),
    });
  }, [tokens.accessToken, tokens.sessionToken, organizationId]);

  // Main-process screenshot agent while timer is running
  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;
    if (timerStatus !== "running") return;

    const api = getElectronAPI();
    if (!api?.tracking) return;

    const accessToken =
      tokens.accessToken || localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (!accessToken) return;

    const enableScreenshots =
      process.env.NEXT_PUBLIC_ENABLE_SCREENSHOTS !== "false";
    const screenshotsAllowed =
      enableScreenshots &&
      !(
        configRef.current?.screenshotEnabled === false &&
        process.env.NEXT_PUBLIC_APP_ENV === "production"
      );

    firstUploadToastRef.current = false;
    let cancelled = false;

    const unsubUploaded = api.tracking.onUploaded((payload) => {
      window.dispatchEvent(
        new CustomEvent(SCREENSHOT_CAPTURED_EVENT, { detail: payload }),
      );
      if (
        process.env.NEXT_PUBLIC_APP_ENV !== "production" &&
        !firstUploadToastRef.current
      ) {
        firstUploadToastRef.current = true;
        toast.success("Screenshots are being captured");
      }
    });

    const unsubFailed = api.tracking.onFailed((payload) => {
      console.warn("[tracking] screenshot failed", payload);
      if (process.env.NEXT_PUBLIC_APP_ENV !== "production") {
        toast.error(
          payload?.message ||
            "Screenshot failed — check screen capture permissions",
        );
      }
    });

    const boot = window.setTimeout(() => {
      if (cancelled) return;
      void api.tracking.start({
        accessToken,
        organizationId,
        deviceId: ensureDeviceId(),
        sessionToken: tokens.sessionToken,
        apiBaseUrl: getApiBaseUrl(),
        screenshotIntervalMs: resolveScreenshotIntervalMs(configRef.current),
        enableScreenshots: screenshotsAllowed,
        firstScreenshotDelayMs: FIRST_SCREENSHOT_MS,
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      unsubUploaded();
      unsubFailed();
      void api.tracking.stop();
    };
  }, [
    isAuthenticated,
    organizationId,
    timerStatus,
    tokens.accessToken,
    tokens.sessionToken,
  ]);

  // Activity sampling + heartbeat (renderer)
  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;
    if (timerStatus !== "running") return;

    const api = getElectronAPI();
    if (!api) return;

    const enableActivity =
      process.env.NEXT_PUBLIC_ENABLE_ACTIVITY_TRACKING !== "false";

    let cancelled = false;
    void api.activity.start();

    const flush = async () => {
      const batch = queueRef.current.splice(0, queueRef.current.length);
      if (!batch.length) return;
      try {
        await activityApi.bulk(batch);
      } catch {
        queueRef.current = [...batch, ...queueRef.current].slice(0, 200);
      }
    };

    const sample = async () => {
      if (!enableActivity || cancelled) return;
      if (
        configRef.current?.activityMonitoringEnabled === false &&
        process.env.NEXT_PUBLIC_APP_ENV === "production"
      ) {
        return;
      }

      try {
        const idle = await api.activity.getIdleState(IDLE_THRESHOLD_SEC);
        const win = await api.activity.getActiveWindow();
        const now = Date.now();
        const prev = lastSampleRef.current;

        if (prev) {
          const durationSec = Math.max(1, Math.round((now - prev.at) / 1000));
          queueRef.current.push({
            timestamp: new Date(prev.at).toISOString(),
            appName: prev.appName || "Desktop",
            windowTitle: prev.windowTitle || undefined,
            duration: durationSec,
            isIdle: prev.isIdle,
            deviceId: ensureDeviceId(),
          });
        }

        lastSampleRef.current = {
          appName: win.appName || "Desktop",
          windowTitle: win.windowTitle || "",
          isIdle: idle.idle,
          at: now,
        };
      } catch (err) {
        console.warn("[tracking] activity sample failed", err);
      }
    };

    const heartbeat = async () => {
      try {
        await activityApi.heartbeat();
      } catch {
        // ignore
      }
    };

    void sample();
    void heartbeat();

    const sampleId = window.setInterval(() => {
      void sample();
    }, ACTIVITY_SAMPLE_MS);
    const flushId = window.setInterval(() => {
      void flush();
    }, FLUSH_MS);
    const heartbeatId = window.setInterval(() => {
      void heartbeat();
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.clearInterval(sampleId);
      window.clearInterval(flushId);
      window.clearInterval(heartbeatId);
      void flush();
      void api.activity.stop();
      lastSampleRef.current = null;
    };
  }, [isAuthenticated, organizationId, timerStatus]);
}
