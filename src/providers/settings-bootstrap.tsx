/**
 * Bootstraps preferences from Electron / local store.
 * Theme switching is deferred (Coming soon) — app stays light.
 */
"use client";

import { useEffect } from "react";
import {
  hydrateSettingsFromElectron,
  useSettingsStore,
} from "@/store/settings.store";

function mergeSettings(
  local: ReturnType<typeof useSettingsStore.getState>["settings"],
  remote: Partial<ReturnType<typeof useSettingsStore.getState>["settings"]>,
) {
  return {
    ...local,
    ...remote,
    theme: "light" as const,
  };
}

export function SettingsBootstrap() {
  const replaceSettings = useSettingsStore((s) => s.replaceSettings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const markReady = useSettingsStore((s) => s.markReady);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = useSettingsStore.getState().settings;
      const remote = await hydrateSettingsFromElectron();
      if (cancelled) return;

      const merged = remote ? mergeSettings(local, remote) : local;
      replaceSettings(merged);
      // Keep Electron main process in sync (notifications, idle timeout, etc.).
      await setSettings(merged);
      markReady();
    })();
    return () => {
      cancelled = true;
    };
  }, [replaceSettings, setSettings, markReady]);

  return null;
}
