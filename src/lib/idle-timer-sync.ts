/**
 * Idle auto-pause / auto-resume of the timer, driven by the main process.
 *
 * Both steps update the local timer immediately — so tracking restarts the
 * moment the user is back, even offline — and the server is told through an
 * ordered retry queue, with the real time each thing happened.
 */
import {
  enqueueTimerEvent,
  flushOfflineQueue,
  hasPendingTimerEvents,
  rememberTimerSession,
} from "@/lib/offline-sync";
import { clearIdlePaused, markIdlePaused } from "@/lib/idle-pause-state";
import { cancelWindowReveal } from "@/lib/window-reveal";
import { getElectronAPI } from "@/services/electron";
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

async function queueOrRetry(kind: "pause" | "resume", occurredAt: string): Promise<void> {
  const timer = useTimerStore.getState().timer;
  const sessionStartedAt = timer.startedAt;
  if (!sessionStartedAt) {
    outbox.submit({ kind, occurredAt });
    return;
  }
  const queued = await enqueueTimerEvent({
    kind,
    occurredAt,
    sessionStartedAt,
    projectId: timer.projectId ?? undefined,
    description: timer.description || undefined,
  });
  if (!queued) {
    outbox.submit({ kind, occurredAt });
    return;
  }
  await rememberTimerSession(kind === "pause" ? "paused" : "running");
  void flushOfflineQueue();
}

/** Pauses as of now: the idle stretch before the pause counts as worked time. */
export function handleIdlePause(): void {
  const store = useTimerStore.getState();
  if (store.timer.status !== "running") {
    // Nothing was paused here, so there is nothing to auto-resume later.
    void getElectronAPI()?.tracking?.disarmIdleResume?.(
      `idle pause skipped: window timer is ${store.timer.status}`,
    );
    return;
  }

  markIdlePaused();
  const occurredAt = new Date().toISOString();
  // timer.elapsedMs only moves while the clock UI is ticking; work it out live.
  const liveMs = store.segmentStartedAt
    ? store.baseElapsedMs + (Date.now() - store.segmentStartedAt)
    : store.timer.elapsedMs;
  store.applyElapsedSeconds(liveMs / 1000, "paused");
  cancelWindowReveal();
  void queueOrRetry("pause", occurredAt);
}

/**
 * The window shows a different status than main expects (a server sync
 * flipped it during the break). Ask the server before deciding. Skipped when
 * offline events are still unsent, because the server is behind then.
 */
async function refreshFromServer(): Promise<void> {
  try {
    if (await hasPendingTimerEvents()) return;
    const apiTimer = await timerApi.current();
    useTimerStore.getState().hydrateFromApi(apiTimer);
  } catch {
    // Offline or server down: decide from what the window already has.
  }
}

/**
 * Resumes after an idle pause, however long the break was. A paused window
 * resumes at once (no network needed). Any other status is checked with the
 * server first instead of being skipped silently.
 */
export async function handleIdleResume(resumedAt?: string): Promise<void> {
  const occurredAt = resumedAt ?? new Date().toISOString();

  if (useTimerStore.getState().timer.status !== "paused") {
    await refreshFromServer();
  }

  const store = useTimerStore.getState();
  const status = store.timer.status;
  clearIdlePaused();

  if (status === "running") return;
  if (status !== "paused") {
    console.warn(`[tracking] idle resume skipped: no paused timer (status ${status})`);
    // Main already switched the tray to running; put it back.
    void getElectronAPI()?.window?.setTimerStatus?.(status);
    return;
  }

  store.applyElapsedSeconds(store.timer.elapsedMs / 1000, "running");
  void queueOrRetry("resume", occurredAt);
}
