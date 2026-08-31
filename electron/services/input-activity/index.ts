/**
 * Samples mouse + keyboard activity while the timer is running.
 * A second counts as active only if real input occurred in that second.
 */
import log from "electron-log/main";
import { IdleService } from "../idle";

const TICK_MS = 1_000;

export class InputActivityMonitor {
  private static instance: InputActivityMonitor | null = null;

  private tickTimer: NodeJS.Timeout | null = null;
  private activeTicks = 0;
  private idleTicks = 0;
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

  start(intervalMs: number, onIdleForInterval: () => void) {
    this.stop();
    this.resetWindow();
    this.consecutiveIdleTicks = 0;
    this.idleEmitted = false;
    this.intervalSeconds = Math.max(60, Math.round(intervalMs / 1000));
    this.onIdleForInterval = onIdleForInterval;
    IdleService.getInstance().startWatching();
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
    log.info(
      `[InputActivityMonitor] started — idle pause after ${this.intervalSeconds}s without input`,
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
    const total = this.activeTicks + this.idleTicks;
    const percent =
      total <= 0
        ? 0
        : Math.round((this.activeTicks / total) * 100);
    log.info(
      `[InputActivityMonitor] window activity ${percent}% (${this.activeTicks}s active / ${total}s sampled)`,
    );
    this.resetWindow();
    return Math.max(0, Math.min(100, percent));
  }

  peekPercent(): number {
    const total = this.activeTicks + this.idleTicks;
    if (total <= 0) return 0;
    return Math.max(
      0,
      Math.min(100, Math.round((this.activeTicks / total) * 100)),
    );
  }

  private resetWindow() {
    this.activeTicks = 0;
    this.idleTicks = 0;
  }

  private tick() {
    const idleSeconds = IdleService.getInstance().getIdleSeconds();
    const active = idleSeconds < 1;
    if (active) {
      this.activeTicks += 1;
      this.consecutiveIdleTicks = 0;
      return;
    }

    this.idleTicks += 1;
    this.consecutiveIdleTicks += 1;

    if (
      !this.idleEmitted &&
      this.consecutiveIdleTicks >= this.intervalSeconds
    ) {
      this.idleEmitted = true;
      log.info(
        `[InputActivityMonitor] idle for ${this.consecutiveIdleTicks}s — requesting timer pause`,
      );
      this.onIdleForInterval?.();
    }
  }
}
