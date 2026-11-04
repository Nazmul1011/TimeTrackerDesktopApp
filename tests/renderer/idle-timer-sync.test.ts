/**
 * Window side of idle auto-pause / auto-resume (src/lib/idle-timer-sync.ts).
 * A paused timer resumes at once; any other status is checked with the server
 * instead of being skipped silently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Status = "idle" | "running" | "paused";

const h = vi.hoisted(() => {
  const state = {
    timer: {
      status: "paused" as Status,
      elapsedMs: 3_600_000,
      startedAt: "2026-11-03T08:00:00.000Z" as string | null,
      projectId: null as string | null,
      description: "",
    },
    segmentStartedAt: null as number | null,
    baseElapsedMs: 3_600_000,
    applyElapsedSeconds: (seconds: number, status: Status) => {
      state.timer = { ...state.timer, status, elapsedMs: seconds * 1000 };
    },
    hydrateFromApi: (api: { status: Status } | null) => {
      state.timer = api
        ? { ...state.timer, status: api.status }
        : { ...state.timer, status: "idle", startedAt: null, elapsedMs: 0 };
    },
  };
  return {
    state,
    current: vi.fn(),
    pendingEvents: false,
    queued: [] as Array<{ kind: string; occurredAt: string }>,
    disarm: vi.fn(),
    setTimerStatus: vi.fn(),
  };
});

vi.mock("@/store/timer.store", () => ({
  useTimerStore: { getState: () => h.state },
}));
vi.mock("@/services/api/timer.api", () => ({
  timerApi: { current: h.current, pause: vi.fn(), resume: vi.fn() },
}));
vi.mock("@/lib/offline-sync", () => ({
  enqueueTimerEvent: vi.fn(async (event: { kind: string; occurredAt: string }) => {
    h.queued.push({ kind: event.kind, occurredAt: event.occurredAt });
    return true;
  }),
  flushOfflineQueue: vi.fn(async () => undefined),
  hasPendingTimerEvents: vi.fn(async () => h.pendingEvents),
  rememberTimerSession: vi.fn(async () => undefined),
}));
vi.mock("@/lib/window-reveal", () => ({ cancelWindowReveal: vi.fn() }));
vi.mock("@/services/electron", () => ({
  getElectronAPI: () => ({
    tracking: { disarmIdleResume: h.disarm },
    window: { setTimerStatus: h.setTimerStatus },
  }),
}));

import { handleIdlePause, handleIdleResume } from "@/lib/idle-timer-sync";
import { clearIdlePaused, isIdlePaused } from "@/lib/idle-pause-state";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setStatus(status: Status) {
  h.state.timer = { ...h.state.timer, status, startedAt: "2026-11-03T08:00:00.000Z" };
}

describe("handleIdleResume", () => {
  beforeEach(() => {
    h.current.mockReset();
    h.disarm.mockReset();
    h.setTimerStatus.mockReset();
    h.pendingEvents = false;
    h.queued = [];
    clearIdlePaused();
    setStatus("paused");
  });

  it("resumes a paused timer at once after a long break, without asking the server", async () => {
    const resumedAt = "2026-11-03T14:00:00.000Z"; // 5 hours later
    await handleIdleResume(resumedAt);
    await flush();

    expect(h.state.timer.status).toBe("running");
    expect(h.current).not.toHaveBeenCalled();
    expect(h.queued).toEqual([{ kind: "resume", occurredAt: resumedAt }]);
  });

  it("resumes while offline: the resume is queued with the time of the input", async () => {
    h.current.mockRejectedValue(new Error("Network Error"));
    await handleIdleResume("2026-11-03T12:00:00.000Z");
    await flush();
    expect(h.state.timer.status).toBe("running");
    expect(h.queued[0]).toEqual({ kind: "resume", occurredAt: "2026-11-03T12:00:00.000Z" });
  });

  it("asks the server when a sync flipped the window, then resumes", async () => {
    setStatus("idle");
    h.current.mockResolvedValue({ status: "paused" });

    await handleIdleResume("2026-11-03T12:00:00.000Z");
    await flush();

    expect(h.current).toHaveBeenCalledTimes(1);
    expect(h.state.timer.status).toBe("running");
    expect(h.queued.map((e) => e.kind)).toEqual(["resume"]);
  });

  it("does not resume when the session ended elsewhere, and fixes the tray", async () => {
    setStatus("idle");
    h.current.mockResolvedValue(null);

    await handleIdleResume();
    await flush();

    expect(h.state.timer.status).toBe("idle");
    expect(h.queued).toEqual([]);
    expect(h.setTimerStatus).toHaveBeenCalledWith("idle");
  });

  it("does nothing more when the timer is already running", async () => {
    setStatus("running");
    h.current.mockResolvedValue({ status: "running" });
    await handleIdleResume();
    await flush();
    expect(h.state.timer.status).toBe("running");
    expect(h.queued).toEqual([]);
    expect(h.setTimerStatus).not.toHaveBeenCalled();
  });

  it("does not trust the server while offline events are still unsent", async () => {
    setStatus("idle");
    h.pendingEvents = true;
    await handleIdleResume();
    await flush();
    expect(h.current).not.toHaveBeenCalled();
    expect(h.queued).toEqual([]);
  });

  it("clears the idle-pause flag once handled", async () => {
    setStatus("running");
    handleIdlePause();
    expect(isIdlePaused()).toBe(true);
    await handleIdleResume();
    expect(isIdlePaused()).toBe(false);
  });
});

describe("handleIdlePause", () => {
  beforeEach(() => {
    h.disarm.mockReset();
    h.queued = [];
    clearIdlePaused();
  });

  it("pauses a running timer and remembers it was an idle pause", async () => {
    setStatus("running");
    handleIdlePause();
    await flush();
    expect(h.state.timer.status).toBe("paused");
    expect(isIdlePaused()).toBe(true);
    expect(h.queued.map((e) => e.kind)).toEqual(["pause"]);
    expect(h.disarm).not.toHaveBeenCalled();
  });

  it("cancels auto-resume when nothing was running here (a manual pause stays manual)", () => {
    setStatus("paused");
    handleIdlePause();
    expect(isIdlePaused()).toBe(false);
    expect(h.disarm).toHaveBeenCalledWith("idle pause skipped: window timer is paused");
  });
});
