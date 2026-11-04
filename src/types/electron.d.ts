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
    } | null>;
    saveSession: (payload: {
      accessToken: string | null;
      refreshToken: string | null;
      sessionToken: string | null;
      organizationId: string | null;
      user: unknown | null;
      organizations: unknown[] | null;
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
    getActiveWindow: () => Promise<{ appName: string; windowTitle: string; website?: string }>;
    /** Keyboard/mouse score since the last call, 0–100. */
    takeInputScore: () => Promise<{ activityPercent: number }>;
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
      callback: (payload?: { intervalMs?: number; activityPercent?: number }) => void,
    ) => () => void;
    onIdleResume: (callback: (payload?: { resumedAt?: string }) => void) => () => void;
    disarmIdleResume: (reason?: string) => Promise<{ ok: boolean }>;
    armIdleResume?: (reason?: string) => Promise<{ ok: boolean; armed: boolean }>;
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
      timelineEditEnabled: boolean;
    }>;
    set: (
      payload: Partial<{
        theme: "light" | "dark" | "system";
        screenshotIntervalMinutes: number;
        idleTimeoutMinutes: number;
        autoStartOnLogin: boolean;
        notificationsEnabled: boolean;
        timelineEditEnabled: boolean;
      }>,
    ) => Promise<{
      ok: boolean;
      settings?: {
        theme: "light" | "dark" | "system";
        screenshotIntervalMinutes: number;
        idleTimeoutMinutes: number;
        autoStartOnLogin: boolean;
        notificationsEnabled: boolean;
        timelineEditEnabled: boolean;
      };
      message?: string;
    }>;
  };
  sync: {
    enqueue: (body: { kind: string; payload: unknown }) => Promise<{ ok: boolean; id?: number }>;
    list: (
      kind?: string,
    ) => Promise<Array<{ id: number; kind: string; payload: unknown; createdAt: string }>>;
    ack: (ids: number[]) => Promise<{ ok: boolean }>;
    clear: (kind: string) => Promise<{ ok: boolean }>;
    getBootId: () => Promise<string>;
    getSession: (organizationId: string) => Promise<{
      organizationId: string;
      status: "running" | "paused" | "idle";
      startedAt: string | null;
      lastEventAt: string | null;
      projectId: string | null;
      description: string | null;
      bootId: string | null;
    } | null>;
    saveSession: (session: {
      organizationId: string;
      status: "running" | "paused" | "idle";
      startedAt: string | null;
      lastEventAt: string | null;
      projectId: string | null;
      description: string | null;
    }) => Promise<{ ok: boolean }>;
    flushScreenshots: () => Promise<{ ok: boolean; uploaded: number }>;
    pendingScreenshots: () => Promise<
      Array<{
        id: string;
        capturedAt: string;
        appName: string;
        activityPercent: number | null;
        imageUrl: string;
      }>
    >;
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
