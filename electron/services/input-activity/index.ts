/**
 * Samples mouse + keyboard activity while the timer is running.
 * Uses 250ms samples; a sample is active when input occurred in the last second.
 */
import log from "electron-log/main";
import { IdleService } from "../idle";

const TICK_MS = 250;
const TICKS_PER_IDLE_SECOND = 1000 / TICK_MS;
const ACTIVE_WINDOW_MS = 1_000;

export class InputActivityMonitor {
  private static instance: InputActivityMonitor | null = null;

  private tickTimer: NodeJS.Timeout | null = null;
  private activeSamples = 0;
  private idleSamples = 0;
  private consecutiveIdleSeconds = 0;
  private consecutiveIdleTicks = 0;
  private intervalSeconds = 300;
  private idleEmitted = false;
  private onIdleForInterval: (() => void) | null = null;

  static getInstance(): InputActivityMonitor {
    if (!InputActivityMonitor.instance) {
      InputActivityMonitor.instance = new InputActivityMonitor();
    }
    return InputActivityMonitor.instance;
  }

  start(intervalMs: number, onIdleForInterval: (() => void) | null) {
    this.stop();
    this.resetWindow();
    this.consecutiveIdleSeconds = 0;
    this.consecutiveIdleTicks = 0;
    this.idleEmitted = false;
    this.onIdleForInterval = onIdleForInterval;
    this.intervalSeconds =
      intervalMs > 0
        ? Math.max(30, Math.round(intervalMs / 1000))
        : Number.MAX_SAFE_INTEGER;
    IdleService.getInstance().startWatching();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    log.info(
      intervalMs > 0
        ? `[InputActivityMonitor] started — ${TICK_MS}ms samples, idle pause after ${this.intervalSeconds}s without input`
        : `[InputActivityMonitor] started — ${TICK_MS}ms samples, idle auto-pause disabled`,
    );
  }

  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.onIdleForInterval = null;
    IdleService.getInstance().stopWatching();
  }

  /** Activity % since the last screenshot, then start a new window. */
  consumePercent(): number {
    const percent = this.computePercent();
    log.info(
      `[InputActivityMonitor] window activity ${percent}% (${this.activeSamples} active / ${this.activeSamples + this.idleSamples} samples)`,
    );
    this.resetWindow();
    return percent;
  }

  peekPercent(): number {
    return this.computePercent();
  }

  private computePercent(): number {
    const total = this.activeSamples + this.idleSamples;
    if (total <= 0) return 0;
    const raw = (this.activeSamples / total) * 100;
    return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
  }

  private resetWindow() {
    this.activeSamples = 0;
    this.idleSamples = 0;
  }

  private tick() {
    const active = IdleService.getInstance().hadRecentInput(ACTIVE_WINDOW_MS);
    if (active) {
      this.activeSamples += 1;
      this.consecutiveIdleTicks = 0;
      this.consecutiveIdleSeconds = 0;
      return;
    }

    this.idleSamples += 1;
    this.consecutiveIdleTicks += 1;
    if (this.consecutiveIdleTicks >= TICKS_PER_IDLE_SECOND) {
      this.consecutiveIdleTicks = 0;
      this.consecutiveIdleSeconds += 1;
    }

    if (
      !this.idleEmitted &&
      this.consecutiveIdleSeconds >= this.intervalSeconds
    ) {
      this.idleEmitted = true;
      log.info(
        `[InputActivityMonitor] idle for ${this.consecutiveIdleSeconds}s — requesting timer pause`,
      );
      this.onIdleForInterval?.();
    }
  }
}
