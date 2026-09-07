/**
 * Settings Zustand store — persisted locally and synced to Electron main.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "@/constants/storage";
import { getElectronAPI, isElectron } from "@/services/electron";
import type { Settings } from "@/types";

interface SettingsState {
  settings: Settings;
  /** True after first hydration from disk / Electron. */
  ready: boolean;
  setSettings: (partial: Partial<Settings>) => Promise<{
    ok: boolean;
    message?: string;
  }>;
  replaceSettings: (settings: Settings) => void;
  markReady: () => void;
  reset: () => Promise<void>;
}

/** Idle auto-pause when detection is on. Default: 1 minute. */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 1;

export function formatIdleTimeoutLabel(minutes: number): string {
  if (minutes <= 0) return "off";
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} sec`;
  return `${minutes} min`;
}

export const defaultSettings: Settings = {
  theme: "light",
  screenshotIntervalMinutes: 5,
  idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
  autoStartOnLogin: false,
  notificationsEnabled: true,
};

function mergeSettings(partial: Partial<Settings>, base: Settings): Settings {
  return {
    theme:
      partial.theme === "light" || partial.theme === "dark" || partial.theme === "system"
        ? partial.theme
        : base.theme,
    screenshotIntervalMinutes:
      typeof partial.screenshotIntervalMinutes === "number" && partial.screenshotIntervalMinutes > 0
        ? partial.screenshotIntervalMinutes
        : base.screenshotIntervalMinutes,
    idleTimeoutMinutes:
      typeof partial.idleTimeoutMinutes === "number" && partial.idleTimeoutMinutes >= 0
        ? // Test defaults were 30s (0.5) and 3s (0.05); old factory default was 3 min.
          partial.idleTimeoutMinutes === 0.5 ||
          partial.idleTimeoutMinutes === 0.05 ||
          partial.idleTimeoutMinutes === 3
          ? DEFAULT_IDLE_TIMEOUT_MINUTES
          : partial.idleTimeoutMinutes
        : base.idleTimeoutMinutes,
    autoStartOnLogin:
      typeof partial.autoStartOnLogin === "boolean"
        ? partial.autoStartOnLogin
        : base.autoStartOnLogin,
    notificationsEnabled:
      typeof partial.notificationsEnabled === "boolean"
        ? partial.notificationsEnabled
        : base.notificationsEnabled,
  };
}

async function pushToElectron(
  settings: Settings,
): Promise<{ ok: boolean; settings?: Settings; message?: string }> {
  if (!isElectron()) return { ok: true, settings };
  const api = getElectronAPI();
  if (!api?.settings?.set) return { ok: true, settings };
  try {
    const result = (await api.settings.set(settings)) as {
      ok?: boolean;
      settings?: Settings;
      message?: string;
    };
    return {
      ok: result?.ok !== false,
      settings: result?.settings,
      message: result?.message,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to save desktop settings",
    };
  }
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      ready: false,

      markReady: () => set({ ready: true }),

      replaceSettings: (settings) => set({ settings: mergeSettings(settings, defaultSettings) }),

      setSettings: async (partial) => {
        const prev = get().settings;
        const optimistic = mergeSettings(partial, prev);
        set({ settings: optimistic });

        const result = await pushToElectron(optimistic);
        if (!result.ok) {
          set({ settings: prev });
          return { ok: false, message: result.message };
        }
        if (result.settings) {
          set({ settings: mergeSettings(result.settings, optimistic) });
        }
        return { ok: true };
      },

      reset: async () => {
        set({ settings: defaultSettings });
        await pushToElectron(defaultSettings);
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);

/** Load Electron-backed settings (source of truth for launch-on-login). */
export async function hydrateSettingsFromElectron(): Promise<Settings | null> {
  if (!isElectron()) return null;
  const api = getElectronAPI();
  if (!api?.settings?.get) return null;
  try {
    const remote = (await api.settings.get()) as Partial<Settings> | null;
    if (!remote || typeof remote !== "object") return null;
    return mergeSettings(remote, defaultSettings);
  } catch {
    return null;
  }
}
