/**
 * Idle detection via Electron powerMonitor.
 */
import { powerMonitor } from "electron";
import log from "electron-log/main";

export class IdleService {
  private static instance: IdleService | null = null;

  static getInstance(): IdleService {
    if (!IdleService.instance) {
      IdleService.instance = new IdleService();
    }
    return IdleService.instance;
  }

  /** System idle time in seconds */
  getIdleSeconds(): number {
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
}
