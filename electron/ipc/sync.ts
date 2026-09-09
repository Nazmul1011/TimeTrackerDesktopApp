/**
 * Offline outbox IPC — enqueue, restore, and flush.
 */
import { ipcMain } from "electron";
import log from "electron-log/main";
import { OfflineQueue, type LocalTimerSnapshot } from "../services/offline/queue";
import { SyncService } from "../services/sync";

export function registerSyncIpc(): void {
  const queue = OfflineQueue.getInstance();
  const sync = SyncService.getInstance();
  sync.startPeriodicFlush();

  ipcMain.handle("sync:run", async () => {
    const result = await sync.run();
    log.info("[ipc:sync] run", {
      ok: result.ok,
      pending: result.status.pending,
    });
    return result;
  });

  ipcMain.handle("sync:getStatus", async () => {
    return sync.getStatus();
  });

  ipcMain.handle(
    "sync:enqueueTimerEvent",
    async (
      _event,
      payload: {
        type: "start" | "pause" | "resume" | "stop";
        occurredAt: string;
        projectId?: string | null;
        description?: string | null;
      },
    ) => {
      const row = queue.enqueueTimerEvent(payload);
      sync.schedule();
      sync.emitStatus();
      return { ok: true, id: row.id, pending: queue.getPendingCounts() };
    },
  );

  ipcMain.handle(
    "sync:saveLocalTimer",
    async (_event, snapshot: LocalTimerSnapshot) => {
      queue.saveLocalTimer(snapshot);
      return { ok: true };
    },
  );

  ipcMain.handle("sync:getLocalTimer", async () => {
    return queue.getLocalTimer();
  });

  ipcMain.handle(
    "sync:enqueueActivities",
    async (_event, payloads: unknown[]) => {
      if (!Array.isArray(payloads) || payloads.length === 0) {
        return { ok: true, pending: queue.getPendingCounts() };
      }
      queue.enqueueActivities(payloads);
      sync.schedule();
      sync.emitStatus();
      return { ok: true, pending: queue.getPendingCounts() };
    },
  );

  ipcMain.handle("sync:pendingCounts", async () => {
    return queue.getPendingCounts();
  });
}
