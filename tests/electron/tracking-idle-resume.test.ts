/**
 * TrackingService idle auto-resume: waits however long the break is, logs why
 * it was cancelled, can be turned back on, and restarts a dead watcher.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sent: [] as Array<{ channel: string; payload: unknown }>,
  logs: [] as string[],
  idle: {
    watching: false,
    lastUserInputAt: 0,
    startWatching() {
      h.idle.watching = true;
    },
    stopWatching() {
      h.idle.watching = false;
    },
    isWatching() {
      return h.idle.watching;
    },
    inputOccurredAfter(epochMs: number) {
      return h.idle.watching && h.idle.lastUserInputAt > epochMs;
    },
  },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: (msg: string) => h.logs.push(msg),
    warn: (msg: string) => h.logs.push(msg),
    error: (msg: string) => h.logs.push(msg),
  },
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp", isReady: () => true },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }),
        },
      },
    ],
  },
}));

vi.mock("../../electron/database/outbox", () => ({
  ackOutbox: vi.fn(),
  countScreenshotFiles: vi.fn(() => 0),
  enqueueOutbox: vi.fn(),
  listOutbox: vi.fn(() => []),
  offlineScreenshotDir: vi.fn(() => "/tmp"),
}));
vi.mock("../../electron/services/screenshots", () => ({
  ScreenshotService: { getInstance: () => ({ resetWarnings: vi.fn() }) },
}));
vi.mock("../../electron/services/activity", () => ({
  ActivityService: { getInstance: () => ({ start: vi.fn(), stop: vi.fn() }) },
}));
vi.mock("../../electron/services/input-activity", () => ({
  InputActivityMonitor: {
    getInstance: () => ({ start: vi.fn(), stop: vi.fn(), peekPercent: () => 0 }),
  },
}));
vi.mock("../../electron/services/idle", () => ({
  IdleService: { getInstance: () => h.idle },
}));
vi.mock("../../electron/services/notifications", () => ({
  NotificationService: {
    getInstance: () => ({ showTimerIdlePaused: vi.fn(), showTimerIdleResumed: vi.fn() }),
  },
}));
vi.mock("../../electron/services/window-reveal", () => ({
  WindowRevealService: { getInstance: () => ({ cancel: vi.fn() }) },
}));
vi.mock("../../electron/main/tray", () => ({ setTrayTimerStatus: vi.fn() }));
vi.mock("../../electron/services/mac-permissions", () => ({
  MacPermissions: { clearCaptureBlock: vi.fn() },
}));
vi.mock("../../electron/api-url", () => ({ getMainApiBaseUrl: () => "http://localhost" }));

type TrackingModule = typeof import("../../electron/services/tracking");
type Internals = {
  running: boolean;
  options: { enableScreenshots: boolean; idleTimeoutMs: number; screenshotIntervalMs: number };
  handleIdleTimeout: () => Promise<void>;
};

const HOUR = 60 * 60_000;

async function idlePausedService() {
  vi.resetModules();
  const mod: TrackingModule = await import("../../electron/services/tracking");
  const service = new (
    mod.TrackingService as unknown as new () => InstanceType<TrackingModule["TrackingService"]>
  )();
  const internals = service as unknown as Internals;
  internals.running = true;
  internals.options.enableScreenshots = false;
  await internals.handleIdleTimeout();
  return service;
}

function userTouchesMouse() {
  h.idle.lastUserInputAt = Date.now();
}

const resumes = () => h.sent.filter((m) => m.channel === "tracking:idle-resume");

describe("TrackingService idle auto-resume", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T09:00:00Z"));
    h.sent = [];
    h.logs = [];
    h.idle.watching = false;
    h.idle.lastUserInputAt = 0;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("idle pause tells the window and starts waiting for input", async () => {
    await idlePausedService();
    expect(h.sent.map((m) => m.channel)).toContain("tracking:idle-timeout");
    expect(h.idle.watching).toBe(true);
    expect(resumes()).toHaveLength(0);
  });

  it("resumes on the first input after a 5 hour break", async () => {
    await idlePausedService();
    vi.advanceTimersByTime(5 * HOUR);
    expect(resumes()).toHaveLength(0);

    userTouchesMouse();
    vi.advanceTimersByTime(300);
    expect(resumes()).toHaveLength(1);

    // Only once.
    userTouchesMouse();
    vi.advanceTimersByTime(1_000);
    expect(resumes()).toHaveLength(1);
  });

  it("restarts a watcher that was turned off, within a minute", async () => {
    await idlePausedService();
    h.idle.stopWatching(); // e.g. something else stopped idle detection

    vi.advanceTimersByTime(61_000);
    expect(h.idle.watching).toBe(true);
    expect(h.logs.some((l) => l.includes("watcher was off"))).toBe(true);

    vi.advanceTimersByTime(2 * HOUR);
    userTouchesMouse();
    vi.advanceTimersByTime(300);
    expect(resumes()).toHaveLength(1);
  });

  it("does not resume after a cancel, and logs the reason", async () => {
    const service = await idlePausedService();
    service.disarmIdleResume("manual pause");
    expect(h.logs).toContain("[TrackingService] idle auto-resume cancelled — manual pause");

    userTouchesMouse();
    vi.advanceTimersByTime(61_000);
    expect(resumes()).toHaveLength(0);
  });

  it("only logs a cancel when it was actually waiting", async () => {
    const service = await idlePausedService();
    service.disarmIdleResume("first");
    service.disarmIdleResume("second");
    expect(h.logs.filter((l) => l.includes("auto-resume cancelled"))).toHaveLength(1);
  });

  it("can be turned back on by the window after a cancel", async () => {
    const service = await idlePausedService();
    service.disarmIdleResume("window timer is running");

    vi.advanceTimersByTime(1_000);
    expect(service.armIdleResume("window still shows an idle pause")).toEqual({
      ok: true,
      armed: true,
    });

    vi.advanceTimersByTime(HOUR);
    userTouchesMouse();
    vi.advanceTimersByTime(300);
    expect(resumes()).toHaveLength(1);
  });

  it("re-arming while already waiting changes nothing", async () => {
    const service = await idlePausedService();
    h.logs = [];
    expect(service.armIdleResume("check")).toEqual({ ok: true, armed: true });
    expect(h.logs.some((l) => l.includes("re-armed"))).toBe(false);
  });

  it("does not arm while tracking is running", async () => {
    vi.resetModules();
    const mod: TrackingModule = await import("../../electron/services/tracking");
    const service = new (
      mod.TrackingService as unknown as new () => InstanceType<TrackingModule["TrackingService"]>
    )();
    (service as unknown as Internals).running = true;
    expect(service.armIdleResume("check")).toEqual({ ok: false, armed: false });

    userTouchesMouse();
    vi.advanceTimersByTime(1_000);
    expect(resumes()).toHaveLength(0);
  });

  it("ignores a renderer stop while waiting (unchanged)", async () => {
    const service = await idlePausedService();
    service.stop();
    vi.advanceTimersByTime(3_000);
    userTouchesMouse();
    vi.advanceTimersByTime(300);
    expect(resumes()).toHaveLength(1);
  });
});
