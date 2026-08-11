/**
 * Sync Service — empty stub.
 * Future: offline queue flush and conflict resolution against the API.
 */
import log from "electron-log/main";

export class SyncService {
  private static instance: SyncService | null = null;

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  async run(): Promise<{ ok: boolean }> {
    log.info("[SyncService] run stub");
    return { ok: false };
  }

  getStatus(): { status: string; lastSyncedAt: string | null } {
    return { status: "idle", lastSyncedAt: null };
  }
}
