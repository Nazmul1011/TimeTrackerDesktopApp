/**
 * Preload script — context-isolated bridge between renderer and main.
 * Exposes a typed `window.electronAPI` surface. No business logic.
 */
import { contextBridge, ipcRenderer } from "electron";

const electronAPI = {
  // Auth
  auth: {
    login: (payload: unknown) => ipcRenderer.invoke("auth:login", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getSession: () => ipcRenderer.invoke("auth:getSession"),
  },
  // Timer
  timer: {
    start: (payload: unknown) => ipcRenderer.invoke("timer:start", payload),
    stop: () => ipcRenderer.invoke("timer:stop"),
    pause: () => ipcRenderer.invoke("timer:pause"),
    resume: () => ipcRenderer.invoke("timer:resume"),
    getStatus: () => ipcRenderer.invoke("timer:getStatus"),
  },
  // Screenshots
  screenshot: {
    capture: () => ipcRenderer.invoke("screenshot:capture"),
    list: () => ipcRenderer.invoke("screenshot:list"),
  },
  // Main-process tracking agent (screenshots while timer runs)
  tracking: {
    start: (payload: unknown) => ipcRenderer.invoke("tracking:start", payload),
    stop: () => ipcRenderer.invoke("tracking:stop"),
    updateAuth: (payload: unknown) =>
      ipcRenderer.invoke("tracking:updateAuth", payload),
    captureNow: () => ipcRenderer.invoke("tracking:captureNow"),
    status: () => ipcRenderer.invoke("tracking:status"),
    onUploaded: (callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on("screenshot:uploaded", listener);
      return () => ipcRenderer.removeListener("screenshot:uploaded", listener);
    },
    onFailed: (callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on("screenshot:failed", listener);
      return () => ipcRenderer.removeListener("screenshot:failed", listener);
    },
    onAuthExpired: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("tracking:auth-expired", listener);
      return () => ipcRenderer.removeListener("tracking:auth-expired", listener);
    },
    onTokenRefreshed: (callback: (payload: { accessToken?: string }) => void) => {
      const listener = (_event: unknown, payload: { accessToken?: string }) =>
        callback(payload);
      ipcRenderer.on("tracking:token-refreshed", listener);
      return () =>
        ipcRenderer.removeListener("tracking:token-refreshed", listener);
    },
    onIdleTimeout: (callback: (payload: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => callback(payload);
      ipcRenderer.on("tracking:idle-timeout", listener);
      return () => ipcRenderer.removeListener("tracking:idle-timeout", listener);
    },
  },
  // Activity
  activity: {
    getIdleState: (thresholdSeconds?: number) =>
      ipcRenderer.invoke("activity:getIdleState", thresholdSeconds),
    getActiveWindow: () => ipcRenderer.invoke("activity:getActiveWindow"),
    getSummary: () => ipcRenderer.invoke("activity:getSummary"),
    start: () => ipcRenderer.invoke("activity:start"),
    stop: () => ipcRenderer.invoke("activity:stop"),
  },
  // Notifications
  notification: {
    show: (payload: unknown) => ipcRenderer.invoke("notification:show", payload),
    list: () => ipcRenderer.invoke("notification:list"),
  },
  // Settings
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (payload: unknown) => ipcRenderer.invoke("settings:set", payload),
  },
  // Window
  window: {
    scheduleRevealAfterResume: (payload?: { delayMs?: number }) =>
      ipcRenderer.invoke("window:scheduleRevealAfterResume", payload ?? {}),
    cancelReveal: () => ipcRenderer.invoke("window:cancelReveal"),
    revealNow: () => ipcRenderer.invoke("window:revealNow"),
  },
  // Sync
  sync: {
    run: () => ipcRenderer.invoke("sync:run"),
    getStatus: () => ipcRenderer.invoke("sync:getStatus"),
  },
  // Platform helpers
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
