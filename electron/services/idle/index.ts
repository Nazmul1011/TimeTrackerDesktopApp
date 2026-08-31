/**
 * Idle detection from real mouse / keyboard input.
 *
 * Electron `powerMonitor.getSystemIdleTime()` is not trustworthy on many Linux
 * desktops (screensaver timeout 0, stuck repeating keys, idle inhibitors).
 * Activity % is derived from cursor movement and non-repeat key/clicks.
 */
import { powerMonitor, screen } from "electron";
import log from "electron-log/main";
import { LinuxXInputListener } from "./linux-xinput";

const CURSOR_POLL_MS = 250;
const MOVE_THRESHOLD_PX = 4;

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
    this.lastInputAt = 0;
    this.lastCursor = null;
    this.lastOsIdle = null;

    this.cursorTimer = setInterval(() => this.poll(), CURSOR_POLL_MS);
    this.poll();

    if (process.platform === "linux") {
      void this.xinput.start((kind) => this.noteInput(kind));
    }

    log.info(
      "[IdleService] watching real input (cursor" +
        (process.platform === "linux" ? " + xinput" : " + OS idle reset") +
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
  }

  isWatching(): boolean {
    return this.watching;
  }

  /** Seconds since the last real mouse move, click, or key press. */
  getIdleSeconds(): number {
    if (this.watching) {
      if (this.lastInputAt <= 0) return 10_000;
      return Math.max(0, Math.floor((Date.now() - this.lastInputAt) / 1000));
    }
    try {
      return powerMonitor.getSystemIdleTime();
    } catch (error) {
      log.warn("[IdleService] getSystemIdleTime failed", error);
      return 0;
    }
  }

  getIdleState(thresholdSeconds = 180): { idle: boolean; idleMs: number } {
    const idleSeconds = this.getIdleSeconds();
    return {
      idle: idleSeconds >= thresholdSeconds,
      idleMs: idleSeconds * 1000,
    };
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
      const dist = Math.hypot(
        point.x - this.lastCursor.x,
        point.y - this.lastCursor.y,
      );
      this.lastCursor = { x: point.x, y: point.y };
      if (dist >= MOVE_THRESHOLD_PX) {
        this.noteInput("mouse");
      }
    } catch {
      // screen APIs can throw before the app is fully ready
    }
  }

  /** OS idle dropping means input happened — useful on Windows/macOS. */
  private pollOsIdleReset() {
    if (process.platform === "linux") return;
    try {
      const osIdle = powerMonitor.getSystemIdleTime();
      if (this.lastOsIdle !== null && osIdle < this.lastOsIdle) {
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
