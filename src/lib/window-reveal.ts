/**
 * Schedule / cancel auto-reveal of the desktop window after timer resume.
 */
import { getElectronAPI, isElectron } from "@/services/electron";
import { useSettingsStore } from "@/store/settings.store";

const DEFAULT_REVEAL_MINUTES = 5;

function resolveRevealDelayMs(): number {
  const idleMinutes = useSettingsStore.getState().settings.idleTimeoutMinutes;
  const minutes = idleMinutes > 0 ? idleMinutes : DEFAULT_REVEAL_MINUTES;
  return Math.max(60_000, minutes * 60_000);
}

export function scheduleWindowRevealAfterResume(): void {
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.window?.scheduleRevealAfterResume) {
    console.warn("[window-reveal] scheduleRevealAfterResume IPC unavailable");
    return;
  }
  void api.window.scheduleRevealAfterResume({
    delayMs: resolveRevealDelayMs(),
  });
}

export function cancelWindowReveal(): void {
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.window?.cancelReveal) return;
  void api.window.cancelReveal();
}

export function revealWindowNow(): void {
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.window?.revealNow) return;
  void api.window.revealNow();
}
