/**
 * Idle detection from real mouse / keyboard input.
 *
 * Linux: cursor poll + xinput for key/click.
 * Windows/macOS: cursor poll + powerMonitor idle-reset (GetLastInputInfo on Win).
 */
import { powerMonitor, screen } from "electron";
import log from "electron-log/main";
import { LinuxXInputListener } from "./linux-xinput";

const CURSOR_POLL_MS = 250;
/** Ignore sub-pixel / compositor jitter so a still mouse does not look like activity. */
const MOVE_THRESHOLD_PX = 5;
/** If OS reports recent input at start, seed lastInputAt so we don't count cold-start as idle. */
const SEED_ACTIVE_IF_IDLE_BELOW_SEC = 2;

export class IdleService {
  private static instance: IdleService | null = null;

  private watching = false;
  private lastInputAt = 0;
  private lastCursor: { x: number; y: number } | null = null;
  private lastOsIdle: number | null = null;
  private cursorTimer: NodeJS.Timeout | null = null;
  private xinput = new LinuxXInputListener();

  static getInstance(): IdleService {
    if (!IdleService.instance) {
      IdleService.instance = new IdleService();
    }
    return IdleService.instance;
  }

  startWatching() {
    this.stopWatching();
    this.watching = true;
    this.lastInputAt = Date.now();
    this.lastCursor = null;
    this.lastOsIdle = null;

    this.seedFromOsIdle();

    this.cursorTimer = setInterval(() => this.poll(), CURSOR_POLL_MS);
    this.poll();

    if (process.platform === "linux") {
      void this.xinput.start((kind) => this.noteInput(kind));
    }

    // Windows/macOS: session unlock / resume are strong activity signals.
    if (process.platform === "win32" || process.platform === "darwin") {
      powerMonitor.on("unlock-screen", this.onSessionActive);
      powerMonitor.on("resume", this.onSessionActive);
    }

    log.info(
      "[IdleService] watching real input (cursor" +
        (process.platform === "linux"
          ? " + xinput"
          : process.platform === "win32"
            ? " + Win GetLastInputInfo via powerMonitor"
            : process.platform === "darwin"
              ? " + macOS CGEventSource idle via powerMonitor"
              : " + OS idle reset") +
        ")",
    );
  }

  stopWatching() {
    this.watching = false;
    if (this.cursorTimer) {
      clearInterval(this.cursorTimer);
      this.cursorTimer = null;
    }
    this.xinput.stop();
    if (process.platform === "win32" || process.platform === "darwin") {
      powerMonitor.removeListener("unlock-screen", this.onSessionActive);
      powerMonitor.removeListener("resume", this.onSessionActive);
    }
  }

  isWatching(): boolean {
    return this.watching;
  }

  /** Seconds since the last real mouse move, click, or key press. */
  getIdleSeconds(): number {
    const ms = this.getMsSinceLastInput();
    if (!Number.isFinite(ms)) return 10_000;
    return Math.floor(ms / 1000);
  }

  /** True when a real mouse/keyboard event landed after `epochMs` (not the watch seed). */
  inputOccurredAfter(epochMs: number): boolean {
    return this.watching && this.lastInputAt > epochMs;
  }

  /** Milliseconds since last detected input (sub-second precision). */
  getMsSinceLastInput(): number {
    if (this.watching) {
      const tracked =
        this.lastInputAt <= 0
          ? Number.POSITIVE_INFINITY
          : Math.max(0, Date.now() - this.lastInputAt);
      // Windows GetLastInputInfo is reliable. macOS getSystemIdleTime() often
      // stays at 0 without Accessibility, which would look like "just typed"
      // and keep the timer running (and instantly auto-resume after pause).
      if (process.platform === "win32") {
        try {
          const osMs = powerMonitor.getSystemIdleTime() * 1000;
          if (osMs <= 0 && Number.isFinite(tracked) && tracked > 1_000) {
            return tracked;
          }
          return Math.min(tracked, osMs);
        } catch {
          return tracked;
        }
      }
      return tracked;
    }
    try {
      return powerMonitor.getSystemIdleTime() * 1000;
    } catch (error) {
      log.warn("[IdleService] getSystemIdleTime failed", error);
      return 0;
    }
  }

  hadRecentInput(withinMs: number): boolean {
    return this.getMsSinceLastInput() < withinMs;
  }

  getIdleState(thresholdSeconds = 120): { idle: boolean; idleMs: number } {
    const idleSeconds = this.getIdleSeconds();
    return {
      idle: idleSeconds >= thresholdSeconds,
      idleMs: idleSeconds * 1000,
    };
  }

  private onSessionActive = () => {
    this.noteInput("os");
  };

  private seedFromOsIdle() {
    try {
      const osIdle = powerMonitor.getSystemIdleTime();
      this.lastOsIdle = osIdle;
      if (osIdle <= SEED_ACTIVE_IF_IDLE_BELOW_SEC) {
        this.lastInputAt = Date.now() - osIdle * 1000;
      }
    } catch {
      // ignore
    }
  }

  private poll() {
    this.pollCursor();
    this.pollOsIdleReset();
  }

  private pollCursor() {
    try {
      const point = screen.getCursorScreenPoint();
      if (!this.lastCursor) {
        this.lastCursor = { x: point.x, y: point.y };
        return;
      }
      const dist = Math.hypot(point.x - this.lastCursor.x, point.y - this.lastCursor.y);
      this.lastCursor = { x: point.x, y: point.y };
      if (dist >= MOVE_THRESHOLD_PX) {
        this.noteInput("mouse");
      }
    } catch {
      // screen APIs can throw before the app is fully ready
    }
  }

  /** OS idle dropping means input happened — keyboard/clicks on Windows & macOS. */
  private pollOsIdleReset() {
    try {
      const osIdle = powerMonitor.getSystemIdleTime();
      // Require a drop of more than 1s so 0↔1 flicker is not treated as typing.
      if (this.lastOsIdle !== null && osIdle + 1 < this.lastOsIdle) {
        this.noteInput("os");
      }
      this.lastOsIdle = osIdle;
    } catch {
      // ignore
    }
  }

  private noteInput(_kind: "mouse" | "keyboard" | "os") {
    this.lastInputAt = Date.now();
  }
}
