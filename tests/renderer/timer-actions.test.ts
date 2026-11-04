/**
 * Characterization tests for timer clicks (src/lib/timer-actions.ts):
 * the clock changes at once, uploads run one at a time in click order,
 * failures that can be retried are queued offline, others roll back.
 * Uses the real timer store; the server and offline queue are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  serverCalls: [] as string[],
  queued: [] as Array<{ kind: string; occurredAt: string; synthetic?: boolean }>,
  pending: false,
  flushes: 0,
  stoppedEvents: 0,
  toastErrors: [] as string[],
  offlineSessions: [] as Array<{ sessionStartedAt: string; endedAt: string; seconds: number }>,
  // Each API call can be given a custom behaviour per test.
  api: {} as Record<string, (body?: unknown) => Promise<unknown>>,
}));

const httpError = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status } });
const networkError = () => new Error("Network Error");

function apiTimer(status: "running" | "paused", startTime: string) {
  return { id: "t1", status, startTime, elapsedSeconds: 0, serverTime: startTime };
}

vi.mock("@/services/api/timer.api", () => {
  const call = (name: string) => async (body?: unknown) => {
    h.serverCalls.push(name);
    const impl = h.api[name];
    if (!impl) throw new Error(`no fake for ${name}`);
    return impl(body);
  };
  return {
    timerApi: {
      start: call("start"),
      pause: call("pause"),
      resume: call("resume"),
      stop: call("stop"),
      current: call("current"),
      resetDay: call("resetDay"),
      sync: call("sync"),
    },
  };
});

vi.mock("@/lib/offline-sync", () => ({
  clearTimerQueue: vi.fn(async () => undefined),
  enqueueTimerEvent: vi.fn(
    async (event: { kind: string; occurredAt: string; synthetic?: boolean }) => {
      h.queued.push({ kind: event.kind, occurredAt: event.occurredAt, synthetic: event.synthetic });
      return true;
    },
  ),
  flushOfflineQueue: vi.fn(async () => {
    h.flushes += 1;
    h.serverCalls.push("flush");
  }),
  hasPendingTimerEvents: vi.fn(async () => h.pending),
  listTimerEvents: vi.fn(async () => h.queued.map((event, id) => ({ id, payload: event }))),
  offlineSavedMessage: () => "Saved offline",
  rememberTimerSession: vi.fn(async () => undefined),
  shouldQueueTimerError: (err: unknown) => {
    const status = (err as { response?: { status?: number } })?.response?.status;
    return status === undefined || status >= 500 || status === 408 || status === 429;
  },
}));

vi.mock("@/lib/timer-events", () => ({
  dispatchTimerStopped: () => {
    h.stoppedEvents += 1;
  },
  TIMER_STOPPED_EVENT: "timer:stopped",
}));
vi.mock("@/lib/window-reveal", () => ({ cancelWindowReveal: vi.fn() }));
vi.mock("@/lib/offline-time", () => ({
  recordOfflineSession: (session: { sessionStartedAt: string; endedAt: string; seconds: number }) =>
    h.offlineSessions.push(session),
}));
vi.mock("@/services/electron", () => ({
  isElectron: () => false,
  getElectronAPI: () => undefined,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    message: vi.fn(),
    error: (msg: string) => h.toastErrors.push(msg),
  }),
}));

import {
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  whenTimerUploadsFinish,
} from "@/lib/timer-actions";
import { isIdlePaused, markIdlePaused } from "@/lib/idle-pause-state";
import { useTimerStore } from "@/store/timer.store";

const status = () => useTimerStore.getState().timer.status;

beforeEach(async () => {
  await whenTimerUploadsFinish();
  h.serverCalls = [];
  h.queued = [];
  h.pending = false;
  h.flushes = 0;
  h.stoppedEvents = 0;
  h.toastErrors = [];
  h.offlineSessions = [];
  h.api = {};
  useTimerStore.getState().reset();
});

describe("startTimer", () => {
  it("starts the clock before the server answers", async () => {
    let answer!: (value: unknown) => void;
    h.api.start = () => new Promise((resolve) => (answer = resolve));

    startTimer(null);
    expect(status()).toBe("running");

    const startedAt = useTimerStore.getState().timer.startedAt!;
    await vi.waitFor(() => expect(h.serverCalls).toContain("start"));
    answer(apiTimer("running", startedAt));
    await whenTimerUploadsFinish();
    expect(status()).toBe("running");
    expect(useTimerStore.getState().timer.id).toBe("t1");
    expect(h.queued).toEqual([]);
  });

  it("offline: keeps running and queues the start with the click time", async () => {
    h.api.start = async () => {
      throw networkError();
    };
    startTimer(null);
    const startedAt = useTimerStore.getState().timer.startedAt!;
    await whenTimerUploadsFinish();

    expect(status()).toBe("running");
    expect(h.queued).toEqual([{ kind: "start", occurredAt: startedAt, synthetic: false }]);
  });

  it("rejected by the server: goes back to idle and shows the error", async () => {
    h.api.start = async () => {
      throw httpError(400);
    };
    startTimer(null);
    await whenTimerUploadsFinish();
    expect(status()).toBe("idle");
    expect(h.queued).toEqual([]);
    expect(h.toastErrors).toHaveLength(1);
  });

  it("409 (already running elsewhere): adopts the server's timer", async () => {
    h.api.start = async () => {
      throw httpError(409);
    };
    h.api.current = async () => apiTimer("paused", "2026-11-03T08:00:00.000Z");
    startTimer(null);
    await whenTimerUploadsFinish();
    expect(status()).toBe("paused");
    expect(useTimerStore.getState().timer.startedAt).toBe("2026-11-03T08:00:00.000Z");
  });

  it("sends older queued events before the new start", async () => {
    h.pending = true;
    h.api.start = async () => apiTimer("running", new Date().toISOString());
    startTimer(null);
    await whenTimerUploadsFinish();
    expect(h.serverCalls).toEqual(["flush", "start"]);
  });
});

describe("pause / resume / stop", () => {
  async function running() {
    h.api.start = async () => apiTimer("running", new Date().toISOString());
    startTimer(null);
    await whenTimerUploadsFinish();
    h.serverCalls = [];
  }

  it("pause changes the clock at once; offline it is queued", async () => {
    await running();
    h.api.pause = async () => {
      throw networkError();
    };
    await pauseTimer();
    expect(status()).toBe("paused");
    await whenTimerUploadsFinish();
    expect(status()).toBe("paused");
    expect(h.queued.map((e) => e.kind)).toEqual(["pause"]);
  });

  it("pause rejected by the server rolls back to running", async () => {
    await running();
    h.api.pause = async () => {
      throw httpError(400);
    };
    await pauseTimer();
    await whenTimerUploadsFinish();
    expect(status()).toBe("running");
    expect(h.toastErrors).toHaveLength(1);
  });

  it("resume rejected by the server rolls back to paused", async () => {
    await running();
    h.api.pause = async () => apiTimer("paused", useTimerStore.getState().timer.startedAt!);
    await pauseTimer();
    await whenTimerUploadsFinish();

    h.api.resume = async () => {
      throw httpError(400);
    };
    await resumeTimer();
    expect(status()).toBe("running");
    await whenTimerUploadsFinish();
    expect(status()).toBe("paused");
  });

  it("uploads run one at a time, in click order", async () => {
    await running();
    const slow = (name: string, result: () => unknown) => async () => {
      await new Promise((resolve) => setTimeout(resolve, name === "pause" ? 30 : 5));
      return result();
    };
    const startedAt = useTimerStore.getState().timer.startedAt!;
    h.api.pause = slow("pause", () => apiTimer("paused", startedAt));
    h.api.resume = slow("resume", () => apiTimer("running", startedAt));

    await pauseTimer();
    await resumeTimer();
    await whenTimerUploadsFinish();
    expect(h.serverCalls).toEqual(["pause", "resume"]);
    expect(status()).toBe("running");
  });

  it("a late reply to an older click does not undo a newer click", async () => {
    await running();
    const startedAt = useTimerStore.getState().timer.startedAt!;
    let answerPause!: (value: unknown) => void;
    h.api.pause = () => new Promise((resolve) => (answerPause = resolve));
    h.api.resume = async () => apiTimer("running", startedAt);

    await pauseTimer();
    await resumeTimer(); // user clicks Resume before the pause reply arrives
    expect(status()).toBe("running");

    await vi.waitFor(() => expect(h.serverCalls).toContain("pause"));
    answerPause(apiTimer("paused", startedAt));
    await whenTimerUploadsFinish();
    expect(status()).toBe("running");
  });

  it("stop offline queues a start (if missing) and the stop, and reloads totals", async () => {
    h.api.start = async () => {
      throw networkError();
    };
    startTimer(null);
    await whenTimerUploadsFinish();
    h.queued = []; // pretend the start was sent; the stop must re-add one

    h.api.stop = async () => {
      throw networkError();
    };
    const ok = await stopTimer({ silent: true });
    expect(ok).toBe(true);
    expect(status()).toBe("idle");
    await whenTimerUploadsFinish();

    expect(h.queued.map((e) => [e.kind, Boolean(e.synthetic)])).toEqual([
      ["start", true],
      ["stop", false],
    ]);
    expect(h.stoppedEvents).toBe(1);
  });

  it("stop offline records the session so today's total keeps it until it uploads", async () => {
    h.api.start = async () => apiTimer("running", new Date().toISOString());
    startTimer(null);
    await whenTimerUploadsFinish();
    const startedAt = useTimerStore.getState().timer.startedAt!;
    useTimerStore.setState({ baseElapsedMs: 90_000, segmentStartedAt: Date.now() });

    h.api.stop = async () => {
      throw networkError();
    };
    await stopTimer({ silent: true });
    await whenTimerUploadsFinish();

    expect(h.offlineSessions).toHaveLength(1);
    expect(h.offlineSessions[0].sessionStartedAt).toBe(startedAt);
    expect(h.offlineSessions[0].seconds).toBe(90);
  });

  it("a stop the server accepted records nothing", async () => {
    h.api.start = async () => apiTimer("running", new Date().toISOString());
    startTimer(null);
    await whenTimerUploadsFinish();
    h.api.stop = async () => ({ entries: [], count: 0, totalDurationSeconds: 5 });
    await stopTimer({ silent: true });
    await whenTimerUploadsFinish();
    expect(h.offlineSessions).toEqual([]);
  });

  it("stop does nothing when no timer is running", async () => {
    await expect(stopTimer()).resolves.toBe(false);
    expect(h.serverCalls).toEqual([]);
  });
});

describe("idle-pause flag", () => {
  it("any user click clears it, so a manual pause never auto-resumes", async () => {
    h.api.start = async () => apiTimer("running", new Date().toISOString());
    startTimer(null);
    await whenTimerUploadsFinish();

    markIdlePaused();
    h.api.pause = async () => apiTimer("paused", useTimerStore.getState().timer.startedAt!);
    await pauseTimer();
    expect(isIdlePaused()).toBe(false);

    markIdlePaused();
    h.api.resume = async () => apiTimer("running", useTimerStore.getState().timer.startedAt!);
    await resumeTimer();
    expect(isIdlePaused()).toBe(false);

    markIdlePaused();
    h.api.stop = async () => ({ entries: [], count: 0, totalDurationSeconds: 0 });
    await stopTimer({ silent: true });
    expect(isIdlePaused()).toBe(false);
    await whenTimerUploadsFinish();
  });
});
