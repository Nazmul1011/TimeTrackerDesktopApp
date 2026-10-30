/**
 * Ordered retry queue for timer pause/resume sent by idle detection.
 *
 * Idle pause/resume used to be fire-and-forget: if the request failed (Wi-Fi
 * blip, server restart) it was only logged, so the app and the server
 * disagreed about whether the timer was paused until someone noticed. Here a
 * failed call is retried in order, carrying its original `occurredAt`, which
 * the backend honours and treats idempotently (pausing a paused timer is a
 * no-op).
 */

export type TimerOp = { kind: "pause" | "resume"; occurredAt: string };

const MAX_QUEUED = 50;

/** No answer (offline, timeout) or a server-side/transient failure. */
export function isRetryableError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return true;
  const response = (err as { response?: { status?: number } }).response;
  if (!response) return true;
  const status = response.status ?? 0;
  return status >= 500 || status === 408 || status === 429;
}

export function createTimerOutbox<T>(options: {
  send: (op: TimerOp) => Promise<T>;
  /** `remaining` is how many ops are still queued after this one succeeded. */
  onApplied?: (result: T, op: TimerOp, remaining: number) => void;
  /** Called when the server rejects an op for good (e.g. no timer to pause). */
  onDropped?: (op: TimerOp, err: unknown) => void;
  retryMs?: number;
}) {
  const queue: TimerOp[] = [];
  const retryMs = options.retryMs ?? 5_000;
  let draining = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drain();
    }, retryMs);
  }

  async function drain(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (queue.length > 0) {
        const op = queue[0];
        try {
          const result = await options.send(op);
          queue.shift();
          options.onApplied?.(result, op, queue.length);
        } catch (err) {
          if (isRetryableError(err)) {
            scheduleRetry();
            return;
          }
          queue.shift();
          options.onDropped?.(op, err);
        }
      }
    } finally {
      draining = false;
    }
  }

  return {
    submit(op: TimerOp) {
      queue.push(op);
      if (queue.length > MAX_QUEUED) queue.shift();
      void drain();
    },
    pending: () => queue.length,
    clear() {
      queue.length = 0;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    },
  };
}
