/**
 * Notification Service — empty stub.
 * Future: native OS notifications and in-app notification queue.
 */
import log from "electron-log/main";

export class NotificationService {
  private static instance: NotificationService | null = null;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  show(_title: string, _body: string): void {
    log.info("[NotificationService] show stub");
  }

  list(): unknown[] {
    return [];
  }
}
