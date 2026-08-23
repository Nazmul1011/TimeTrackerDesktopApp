/** Browser event fired when a timer session is saved (local or remote stop). */
export const TIMER_STOPPED_EVENT = "gr8r:timer-stopped";

export type TimerStoppedDetail = {
  totalDurationSeconds?: number;
  entryCount?: number;
};

export function dispatchTimerStopped(detail?: TimerStoppedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TimerStoppedDetail>(TIMER_STOPPED_EVENT, { detail }),
  );
}
