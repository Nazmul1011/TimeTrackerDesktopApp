/**
 * Idle auto-pause / auto-resume of the timer, driven by the main process.
 *
 * Both steps update the local timer immediately — so tracking restarts the
 * moment the user is back, even offline — and the server is told through an
 * ordered retry queue, with the real time each thing happened.
 */
import { cancelWindowReveal } from "@/lib/window-reveal";
import { timerApi } from "@/services/api/timer.api";
import type { ApiTimer } from "@/services/api/types";
import { useTimerStore } from "@/store/timer.store";
import { createTimerOutbox } from "@/lib/timer-outbox";

const outbox = createTimerOutbox<ApiTimer>({
  send: (op) =>
    op.kind === "pause"
      ? timerApi.pause({ occurredAt: op.occurredAt })
      : timerApi.resume({ occurredAt: op.occurredAt }),
  onApplied: (apiTimer, _op, remaining) => {
    // Only the last queued call reflects the final state; applying an earlier
    // reply would briefly flip the clock back.
    if (remaining === 0) useTimerStore.getState().hydrateFromApi(apiTimer);
  },
  onDropped: (op, err) => {
    console.warn(`[tracking] idle ${op.kind} rejected by server`, err);
  },
});

/** Idle began at `idleSince`; that stretch is not worked time. */
export function handleIdlePause(idleSince?: string): void {
  const store = useTimerStore.getState();
  if (store.timer.status !== "running") return;

  const occurredAt = idleSince ?? new Date().toISOString();
  const idleMs = Math.max(0, Date.now() - Date.parse(occurredAt));
  // timer.elapsedMs only moves while the clock UI is ticking; work it out live.
  const liveMs = store.segmentStartedAt
    ? store.baseElapsedMs + (Date.now() - store.segmentStartedAt)
    : store.timer.elapsedMs;
  store.applyElapsedSeconds(Math.max(0, liveMs - idleMs) / 1000, "paused");
  cancelWindowReveal();
  outbox.submit({ kind: "pause", occurredAt });
}

export function handleIdleResume(resumedAt?: string): void {
  const store = useTimerStore.getState();
  if (store.timer.status !== "paused") return;

  store.applyElapsedSeconds(store.timer.elapsedMs / 1000, "running");
  outbox.submit({ kind: "resume", occurredAt: resumedAt ?? new Date().toISOString() });
}
