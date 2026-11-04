/**
 * IdleService: what counts as "the user is back" after an idle pause.
 * Long breaks, keyboard, unlocking, and waking from sleep.
 */
import { EventEmitter } from "events";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const os = vi.hoisted(() => ({
  idleSeconds: 0,
  cursor: { x: 100, y: 100 },
  power: null as unknown as EventEmitter & { getSystemIdleTime: () => number },
}));

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("electron", async () => {
  const { EventEmitter: Emitter } = await import("events");
  const power = Object.assign(new Emitter(), { getSystemIdleTime: () => os.idleSeconds });
  os.power = power;
  return {
    powerMonitor: power,
    screen: { getCursorScreenPoint: () => ({ ...os.cursor }) },
  };
});

vi.mock("../../electron/services/idle/linux-xinput", () => ({
  LinuxXInputListener: class {
    start() {
      return Promise.resolve();
    }
    stop() {}
  },
}));

type IdleModule = typeof import("../../electron/services/idle");

const realPlatform = process.platform;
const HOUR = 60 * 60_000;

async function freshIdle() {
  vi.resetModules();
  const mod: IdleModule = await import("../../electron/services/idle");
  return mod.IdleService.getInstance();
}

/** Lets time pass with no input; the OS idle counter grows with it. */
function stayIdle(ms: number) {
  const step = 60_000;
  for (let left = ms; left > 0; left -= step) {
    const chunk = Math.min(step, left);
    os.idleSeconds += chunk / 1000;
    vi.advanceTimersByTime(chunk);
  }
}

describe("IdleService user-return detection", () => {
  beforeAll(() => {
    // Wake/unlock listeners are registered on Windows and macOS only.
    Object.defineProperty(process, "platform", { value: "win32" });
  });
  afterAll(() => {
    Object.defineProperty(process, "platform", { value: realPlatform });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-03T09:00:00Z"));
    os.idleSeconds = 200;
    os.cursor = { x: 100, y: 100 };
  });

  afterEach(() => {
    os.power?.removeAllListeners();
    vi.useRealTimers();
  });

  it("does not treat starting the watch as the user coming back", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    vi.advanceTimersByTime(1_000);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);
    idle.stopWatching();
  });

  it("detects a mouse move after a 3 hour break", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();

    stayIdle(3 * HOUR);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);

    os.cursor = { x: 400, y: 300 };
    os.idleSeconds = 0;
    vi.advanceTimersByTime(300);
    expect(idle.inputOccurredAfter(baseline)).toBe(true);
    idle.stopWatching();
  });

  it("detects a key press after an 8 hour break (OS idle counter drops)", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();

    stayIdle(8 * HOUR);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);

    os.idleSeconds = 0; // key press, mouse did not move
    vi.advanceTimersByTime(300);
    expect(idle.inputOccurredAfter(baseline)).toBe(true);
    idle.stopWatching();
  });

  it("counts unlocking the screen as the user coming back", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    stayIdle(2 * HOUR);

    os.power.emit("unlock-screen");
    expect(idle.inputOccurredAfter(baseline)).toBe(true);
    idle.stopWatching();
  });

  it("does not count waking from sleep (Windows can wake on its own)", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    stayIdle(2 * HOUR);

    os.power.emit("resume");
    // Windows may reset its idle counter on an automatic wake.
    os.idleSeconds = 0;
    vi.advanceTimersByTime(1_000);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);
    idle.stopWatching();
  });

  it("does not count a cursor jump caused by the display changing on wake", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    stayIdle(HOUR);

    os.power.emit("resume");
    os.cursor = { x: 1900, y: 1000 }; // monitor layout changed
    vi.advanceTimersByTime(300);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);
    idle.stopWatching();
  });

  it("detects real input once the user is back after a wake", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    stayIdle(HOUR);

    os.power.emit("resume");
    vi.advanceTimersByTime(1_000);
    os.cursor = { x: 50, y: 50 };
    vi.advanceTimersByTime(300);
    expect(idle.inputOccurredAfter(baseline)).toBe(true);
    idle.stopWatching();
  });

  it("still treats waking as activity for a running timer (unchanged)", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    stayIdle(HOUR);
    expect(idle.getIdleSeconds()).toBeGreaterThan(3_000);

    os.power.emit("resume");
    expect(idle.getIdleSeconds()).toBe(0);
    idle.stopWatching();
  });

  it("reports nothing once watching has stopped", async () => {
    const idle = await freshIdle();
    idle.startWatching();
    const baseline = Date.now();
    idle.stopWatching();
    os.cursor = { x: 900, y: 900 };
    vi.advanceTimersByTime(300);
    expect(idle.inputOccurredAfter(baseline)).toBe(false);
  });
});
