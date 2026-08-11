/**
 * Updater Service — empty stub wrapping electron-updater.
 */
import log from "electron-log/main";

export class UpdaterService {
  private static instance: UpdaterService | null = null;

  static getInstance(): UpdaterService {
    if (!UpdaterService.instance) {
      UpdaterService.instance = new UpdaterService();
    }
    return UpdaterService.instance;
  }

  checkForUpdates(): void {
    log.info("[UpdaterService] checkForUpdates stub");
  }
}
