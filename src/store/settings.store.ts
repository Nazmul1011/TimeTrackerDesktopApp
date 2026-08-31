/**
 * Settings Zustand store — scaffolding only.
 */
import { create } from "zustand";
import type { Settings } from "@/types";

interface SettingsState {
  settings: Settings;
  setSettings: (partial: Partial<Settings>) => void;
  reset: () => void;
}

const defaultSettings: Settings = {
  theme: "system",
  screenshotIntervalMinutes: 5,
  idleTimeoutMinutes: 5,
  autoStartOnLogin: false,
  notificationsEnabled: true,
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),
  reset: () => set({ settings: defaultSettings }),
}));
