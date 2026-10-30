/**
 * Global type augmentations for the renderer.
 * Mirrors the preload bridge shape without importing Electron modules into Next.js.
 */

export interface ElectronAPI {
  auth: {
    login: (payload: unknown) => Promise<unknown>;
    logout: () => Promise<unknown>;
    getSession: () => Promise<{
      accessToken: string | null;
      refreshToken: string | null;
      sessionToken: string | null;
      organizationId: string | null;
      user: unknown | null;
      organizations: unknown[] | null;
      deviceId: string | null;
    } | null>;
    saveSession: (payload: {
      accessToken: string | null;
      refreshToken: string | null;
      sessionToken: string | null;
      organizationId: string | null;
      user: unknown | null;
      organizations: unknown[] | null;
      deviceId?: string | null;
    }) => Promise<{ ok: boolean; message?: string }>;
  };
  timer: {
    start: (payload: unknown) => Promise<unknown>;
    stop: () => Promise<unknown>;
    pause: () => Promise<unknown>;
    resume: () => Promise<unknown>;
    getStatus: () => Promise<unknown>;
  };
  activity: {
    getIdleState: (thresholdSeconds?: number) => Promise<{ idle: boolean; idleMs: number }>;
    getActiveWindow: () => Promise<{ appName: string; windowTitle: string }>;
    /** Real OS app icon as data-URL PNG, or null */
    getAppIcon: (appName: string) => Promise<string | null>;
    getAppIcons: (appNames: string[]) => Promise<Record<string, string | null>>;
    getSummary: () => Promise<unknown>;
    start: () => Promise<{ ok: boolean }>;
    stop: () => Promise<{ ok: boolean }>;
  };
  screenshot: {
    capture: () => Promise<{
      ok: boolean;
      message?: string;
      capturedAt?: string;
      width?: number;
      height?: number;
      mimeType?: string;
      base64?: string;
    }>;
    list: () => Promise<unknown>;
  };
  tracking: {
    start: (payload: {
      accessToken: string;
      refreshToken?: string | null;
      organizationId: string;
      deviceId: string;
      sessionToken?: string | null;
      apiBaseUrl: string;
      screenshotIntervalMs?: number;
      enableScreenshots?: boolean;
      firstScreenshotDelayMs?: number;
      /** 0 disables idle auto-pause */
      idleTimeoutMs?: number;
    }) => Promise<{ ok: boolean; intervalMs?: number; message?: string }>;
    stop: () => Promise<{ ok: boolean }>;
    updateAuth: (payload: {
      accessToken?: string;
      refreshToken?: string | null;
      organizationId?: string;
      deviceId?: string;
      sessionToken?: string | null;
      apiBaseUrl?: string;
    }) => Promise<{ ok: boolean }>;
    captureNow: () => Promise<{
      ok: boolean;
      message?: string;
      id?: string;
      url?: string;
    }>;
    status: () => Promise<{ running: boolean }>;
    onUploaded: (
      callback: (payload: { id?: string; url?: string; activityPercent?: number }) => void,
    ) => () => void;
    onFailed: (callback: (payload: { message?: string }) => void) => () => void;
    onAuthExpired: (callback: () => void) => () => void;
    onTokenRefreshed: (callback: (payload: { accessToken?: string }) => void) => () => void;
    onIdleTimeout: (
      callback: (payload?: {
        intervalMs?: number;
        activityPercent?: number;
        /** ISO time the idle stretch began (now minus the idle timeout). */
        idleSince?: string;
      }) => void,
    ) => () => void;
    onIdleResume: (callback: (payload?: { resumedAt?: string }) => void) => () => void;
    disarmIdleResume: () => Promise<{ ok: boolean }>;
    openScreenRecording: () => Promise<{ ok: boolean }>;
    retryScreenshots: () => Promise<{ ok: boolean; message?: string }>;
  };
  notification: {
    show: (payload: {
      title?: string;
      body?: string;
      message?: string;
    }) => Promise<{ ok: boolean; message?: string }>;
    list: () => Promise<unknown>;
  };
  settings: {
    get: () => Promise<{
      theme: "light" | "dark" | "system";
      screenshotIntervalMinutes: number;
      idleTimeoutMinutes: number;
      autoStartOnLogin: boolean;
      notificationsEnabled: boolean;
    }>;
    set: (
      payload: Partial<{
        theme: "light" | "dark" | "system";
        screenshotIntervalMinutes: number;
        idleTimeoutMinutes: number;
        autoStartOnLogin: boolean;
        notificationsEnabled: boolean;
      }>,
    ) => Promise<{
      ok: boolean;
      settings?: {
        theme: "light" | "dark" | "system";
        screenshotIntervalMinutes: number;
        idleTimeoutMinutes: number;
        autoStartOnLogin: boolean;
        notificationsEnabled: boolean;
      };
      message?: string;
    }>;
  };
  sync: {
    run: () => Promise<{
      ok: boolean;
      message?: string;
      status?: {
        status: string;
        lastSyncedAt: string | null;
        pending: { timer: number; activity: number; screenshots: number };
      };
    }>;
    getStatus: () => Promise<{
      status: string;
      lastSyncedAt: string | null;
      pending: { timer: number; activity: number; screenshots: number };
      message?: string;
    }>;
    enqueueTimerEvent: (payload: {
      type: "start" | "pause" | "resume" | "stop";
      occurredAt: string;
      projectId?: string | null;
      description?: string | null;
    }) => Promise<{ ok: boolean; id?: string }>;
    saveLocalTimer: (payload: {
      status: "idle" | "running" | "paused";
      localId: string | null;
      serverId: string | null;
      projectId: string | null;
      description: string;
      startedAt: string | null;
      elapsedMs: number;
      baseElapsedMs: number;
      segmentStartedAt: number | null;
      isOffline: boolean;
      todayLoggedMs?: number;
      todayDate?: string | null;
    }) => Promise<{ ok: boolean }>;
    getLocalTimer: () => Promise<{
      status: "idle" | "running" | "paused";
      localId: string | null;
      serverId: string | null;
      projectId: string | null;
      description: string;
      startedAt: string | null;
      elapsedMs: number;
      baseElapsedMs: number;
      segmentStartedAt: number | null;
      isOffline: boolean;
      todayLoggedMs?: number;
      todayDate?: string | null;
    } | null>;
    enqueueActivities: (payloads: unknown[]) => Promise<{ ok: boolean }>;
    pendingCounts: () => Promise<{
      timer: number;
      activity: number;
      screenshots: number;
    }>;
    onOrgAccessDenied?: (callback: (payload: { organizationId?: string }) => void) => () => void;
    onStatus: (
      callback: (payload: {
        status: string;
        lastSyncedAt: string | null;
        pending: { timer: number; activity: number; screenshots: number };
        message?: string;
      }) => void,
    ) => () => void;
  };
  tray: {
    setState: (payload: {
      authenticated?: boolean;
      timerStatus?: "idle" | "running" | "paused";
    }) => Promise<{ ok: boolean }>;
    onCommand: (
      callback: (payload: {
        action?: "pause" | "resume" | "stop" | "signOut" | "stopAndQuit";
      }) => void,
    ) => () => void;
  };
  app?: {
    exit: () => Promise<void>;
  };
  updater?: {
    onDownloaded: (callback: (payload: { version: string }) => void) => () => void;
    install: () => Promise<void>;
    check: () => Promise<unknown>;
  };
  window: {
    scheduleRevealAfterResume: (payload?: { delayMs?: number }) => Promise<{ ok: boolean }>;
    cancelReveal: () => Promise<{ ok: boolean }>;
    revealNow: () => Promise<{ ok: boolean }>;
    setTimerStatus: (
      status: "idle" | "running" | "paused",
    ) => Promise<{ ok: boolean; message?: string }>;
  };
  platform: NodeJS.Platform;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
