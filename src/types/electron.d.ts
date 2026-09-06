/**
 * Global type augmentations for the renderer.
 * Mirrors the preload bridge shape without importing Electron modules into Next.js.
 */

export interface ElectronAPI {
  auth: {
    login: (payload: unknown) => Promise<unknown>;
    logout: () => Promise<unknown>;
    getSession: () => Promise<unknown>;
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
      callback: (payload?: { intervalMs?: number; activityPercent?: number }) => void,
    ) => () => void;
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
    run: () => Promise<unknown>;
    getStatus: () => Promise<unknown>;
  };
  window: {
    scheduleRevealAfterResume: (payload?: { delayMs?: number }) => Promise<{ ok: boolean }>;
    cancelReveal: () => Promise<{ ok: boolean }>;
    revealNow: () => Promise<{ ok: boolean }>;
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
