/**
 * Desktop tracking agent — samples activity + idle, uploads screenshots,
 * and heartbeats while the timer is running (Electron only).
 */
"use client";

import { useEffect, useRef } from "react";
import { activityApi } from "@/services/api/activity.api";
import { screenshotApi } from "@/services/api/screenshot.api";
import { monitoringApi, type MonitoringConfig } from "@/services/api/monitoring.api";
import { ensureDeviceId } from "@/services/api/client";
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

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function useTrackingAgent() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);
  const timerStatus = useTimerStore((s) => s.timer.status);

  const queueRef = useRef<Sample[]>([]);
  const lastSampleRef = useRef<{
    appName: string;
    windowTitle: string;
    isIdle: boolean;
    at: number;
  } | null>(null);
  const configRef = useRef<MonitoringConfig | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;

    let cancelled = false;
    void monitoringApi
      .getConfig()
      .then((cfg) => {
        if (!cancelled) configRef.current = cfg;
      })
      .catch(() => {
        // Defaults when config missing
        configRef.current = {
          activityMonitoringEnabled: true,
          screenshotEnabled: true,
          screenshotInterval: 10,
        };
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, organizationId]);

  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;
    if (timerStatus !== "running") return;

    const api = getElectronAPI();
    if (!api) return;

    const enableActivity =
      process.env.NEXT_PUBLIC_ENABLE_ACTIVITY_TRACKING !== "false";
    const enableScreenshots =
      process.env.NEXT_PUBLIC_ENABLE_SCREENSHOTS !== "false";

    void api.activity.start();

    const flush = async () => {
      const batch = queueRef.current.splice(0, queueRef.current.length);
      if (!batch.length) return;
      try {
        await activityApi.bulk(batch);
      } catch {
        // re-queue on failure (cap to avoid unbounded growth)
        queueRef.current = [...batch, ...queueRef.current].slice(0, 200);
      }
    };

    const sample = async () => {
      // Feature flags gate collection; org config still drives screenshot interval.
      // Backend stores org policy; seeded/prod members should enable monitoring in admin.
      if (!enableActivity) return;
      if (configRef.current?.activityMonitoringEnabled === false) {
        // Soft-disable: still sample in desktop when env flag is on so local
        // setups work before an admin flips member monitoring settings.
        if (process.env.NEXT_PUBLIC_APP_ENV === "production") return;
      }

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
    };

    const captureScreenshot = async () => {
      if (!enableScreenshots) return;
      if (
        configRef.current?.screenshotEnabled === false &&
        process.env.NEXT_PUBLIC_APP_ENV === "production"
      ) {
        return;
      }

      const result = await api.screenshot.capture();
      if (!result.ok || !result.base64) return;

      const win = await api.activity.getActiveWindow();
      const blob = base64ToBlob(result.base64, result.mimeType || "image/png");
      await screenshotApi.upload(blob, {
        timestamp: result.capturedAt || new Date().toISOString(),
        appName: win.appName || "Desktop",
        windowTitle: win.windowTitle || undefined,
      });
    };

    const heartbeat = async () => {
      try {
        await activityApi.heartbeat();
      } catch {
        // ignore transient failures
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

    const intervalMinutes = Math.max(
      1,
      Number(configRef.current?.screenshotInterval ?? 10),
    );
    const screenshotId = window.setInterval(
      () => {
        void captureScreenshot().catch(() => undefined);
      },
      intervalMinutes * 60_000,
    );

    // First screenshot shortly after start (useful for demos)
    const firstShot = window.setTimeout(() => {
      void captureScreenshot().catch(() => undefined);
    }, 15_000);

    return () => {
      window.clearInterval(sampleId);
      window.clearInterval(flushId);
      window.clearInterval(heartbeatId);
      window.clearInterval(screenshotId);
      window.clearTimeout(firstShot);
      void flush();
      void api.activity.stop();
      lastSampleRef.current = null;
    };
  }, [isAuthenticated, organizationId, timerStatus]);
}
