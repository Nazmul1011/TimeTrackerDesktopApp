/**
 * Desktop tracking agent — activity sampling in renderer;
 * screenshots run in Electron main while the timer is running.
 */
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { activityApi } from "@/services/api/activity.api";
import { authApi } from "@/services/api/auth.api";
import { monitoringApi, type MonitoringConfig } from "@/services/api/monitoring.api";
import { timerApi } from "@/services/api/timer.api";
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
const FIRST_SCREENSHOT_MS = 3_000;
const TOKEN_REFRESH_MS = 8 * 60_000;
const CONFIG_POLL_MS = 30_000;

export const SCREENSHOT_CAPTURED_EVENT = "gr8r:screenshot-captured";

function resolveScreenshotIntervalMs(cfg: MonitoringConfig | null): number {
  const minutes = Number(cfg?.screenshotInterval);
  const safeMinutes =
    Number.isFinite(minutes) && minutes > 0 ? Math.min(60, Math.max(1, minutes)) : 5;
  return safeMinutes * 60_000;
}

function screenshotsAllowed(cfg: MonitoringConfig | null): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_SCREENSHOTS !== "false" &&
    cfg?.screenshotEnabled !== false
  );
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
            screenshotInterval: 5,
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
      refreshToken: tokens.refreshToken,
      organizationId,
      deviceId: ensureDeviceId(),
      sessionToken: tokens.sessionToken,
      apiBaseUrl: getApiBaseUrl(),
    });
  }, [tokens.accessToken, tokens.refreshToken, tokens.sessionToken, organizationId]);

  // Keep access tokens fresh — JWT expires in 15m and main-process uploads
  // use a snapshot of the token that otherwise goes stale.
  useEffect(() => {
    if (!isElectron()) return;
    const api = getElectronAPI();
    if (!api?.tracking) return;

    const pushAuthToMain = (accessToken?: string | null) => {
      const state = useAuthStore.getState();
      const token =
        accessToken ||
        state.tokens.accessToken ||
        localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return;
      void api.tracking.updateAuth({
        accessToken: token,
        refreshToken:
          state.tokens.refreshToken ||
          localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
        organizationId: state.organizationId ?? undefined,
        deviceId: ensureDeviceId(),
        sessionToken: state.tokens.sessionToken,
        apiBaseUrl: getApiBaseUrl(),
      });
    };

    const applyAccessToken = (accessToken: string) => {
      useAuthStore.getState().setSession({ accessToken });
      pushAuthToMain(accessToken);
    };

    const refreshNow = async () => {
      const refreshToken =
        useAuthStore.getState().tokens.refreshToken ||
        localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
      if (!refreshToken) return;
      try {
        const refreshed = await authApi.refresh(refreshToken);
        applyAccessToken(refreshed.access_token);
      } catch (err) {
        console.warn("[tracking] token refresh failed", err);
      }
    };

    const unsubExpired = api.tracking.onAuthExpired?.(() => {
      void refreshNow();
    });

    const unsubRefreshed = api.tracking.onTokenRefreshed?.((payload) => {
      if (payload?.accessToken) {
        applyAccessToken(payload.accessToken);
      }
    });

    const onAxiosRefresh = (event: Event) => {
      const accessToken = (event as CustomEvent<{ accessToken?: string }>).detail
        ?.accessToken;
      if (accessToken) applyAccessToken(accessToken);
    };
    window.addEventListener("auth:token-refreshed", onAxiosRefresh);

    const refreshId = window.setInterval(() => {
      void refreshNow();
    }, TOKEN_REFRESH_MS);

    return () => {
      unsubExpired?.();
      unsubRefreshed?.();
      window.removeEventListener("auth:token-refreshed", onAxiosRefresh);
      window.clearInterval(refreshId);
    };
  }, []);

  // Main-process screenshot agent while timer is running
  useEffect(() => {
    if (!isAuthenticated || !organizationId || !isElectron()) return;
    if (timerStatus !== "running") return;

    const api = getElectronAPI();
    if (!api?.tracking) return;

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

    const unsubIdle = api.tracking.onIdleTimeout?.((payload) => {
      if (cancelled) return;
      if (useTimerStore.getState().timer.status !== "running") return;
      void (async () => {
        try {
          const apiTimer = await timerApi.pause();
          useTimerStore.getState().hydrateFromApi(apiTimer);
          const minutes = Math.max(
            1,
            Math.round((payload?.intervalMs ?? 5 * 60_000) / 60_000),
          );
          toast.warning(
            `Timer paused — no mouse or keyboard activity for ${minutes} min`,
          );
        } catch (err) {
          console.warn("[tracking] idle auto-pause failed", err);
        }
      })();
    });

    const startTracking = (cfg: MonitoringConfig | null) => {
      const state = useAuthStore.getState();
      const token =
        state.tokens.accessToken ||
        localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      if (!token) return;

      const intervalMs = resolveScreenshotIntervalMs(cfg);
      void api.tracking.start({
        accessToken: token,
        refreshToken:
          state.tokens.refreshToken ||
          localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
        organizationId: state.organizationId || organizationId,
        deviceId: ensureDeviceId(),
        sessionToken: state.tokens.sessionToken,
        apiBaseUrl: getApiBaseUrl(),
        screenshotIntervalMs: intervalMs,
        enableScreenshots: screenshotsAllowed(cfg),
        firstScreenshotDelayMs: FIRST_SCREENSHOT_MS,
      });
    };

    const boot = async () => {
      let cfg = configRef.current;
      if (!cfg) {
        try {
          cfg = await monitoringApi.getConfig();
        } catch {
          cfg = {
            activityMonitoringEnabled: true,
            screenshotEnabled: true,
            screenshotInterval: 5,
          };
        }
        if (cancelled) return;
        configRef.current = cfg;
      }
      if (cancelled) return;
      startTracking(cfg);
    };

    void boot();

    const pollId = window.setInterval(() => {
      void (async () => {
        try {
          const cfg = await monitoringApi.getConfig();
          if (cancelled) return;
          const prev = configRef.current;
          const intervalChanged =
            resolveScreenshotIntervalMs(prev) !==
            resolveScreenshotIntervalMs(cfg);
          const enabledChanged =
            screenshotsAllowed(prev) !== screenshotsAllowed(cfg);
          configRef.current = cfg;
          if (intervalChanged || enabledChanged) {
            startTracking(cfg);
          }
        } catch {
          // keep the running interval if config refresh fails
        }
      })();
    }, CONFIG_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      unsubUploaded();
      unsubFailed();
      unsubIdle?.();
      void api.tracking.stop();
    };
  }, [
    isAuthenticated,
    organizationId,
    timerStatus,
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
        const idle = await api.activity.getIdleState(
          Math.max(1, Math.round(ACTIVITY_SAMPLE_MS / 1000)),
        );
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
