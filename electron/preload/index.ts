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
