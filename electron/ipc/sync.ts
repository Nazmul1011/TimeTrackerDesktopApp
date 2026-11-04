/**
 * Offline outbox IPC. The renderer owns timer and activity uploads
 * (it has the API client). Screenshots are uploaded from the main process.
 */
import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import log from "electron-log/main";
import {
  ackOutbox,
  clearOutbox,
  enqueueOutbox,
  getBootId,
  getOfflineSession,
  listOutbox,
  offlineScreenshotDir,
  saveOfflineSession,
  type OfflineSession,
  type OutboxKind,
} from "../database/outbox";
import { TrackingService } from "../services/tracking";

const KINDS: OutboxKind[] = ["timer", "activity", "screenshot"];

function asKind(value: unknown): OutboxKind | undefined {
  return KINDS.find((kind) => kind === value);
}

function listPendingScreenshotPreviews() {
  const dir = path.resolve(offlineScreenshotDir());
  const rows = listOutbox("screenshot").slice().reverse();
  const previews: Array<{
    id: string;
    capturedAt: string;
    appName: string;
    activityPercent: number | null;
    imageUrl: string;
  }> = [];
  for (const row of rows) {
    if (previews.length >= 8) break;
    const payload = row.payload as {
      filePath?: string;
      timestamp?: string;
      appName?: string;
      mimeType?: string;
      activityPercent?: number;
    };
    if (!payload.filePath) continue;
    const resolved = path.resolve(payload.filePath);
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) continue;
    if (!fs.existsSync(resolved)) continue;
    const size = fs.statSync(resolved).size;
    if (size <= 0 || size > 1_500_000) continue;
    const mimeType = payload.mimeType || "image/jpeg";
    previews.push({
      id: `local-${row.id}`,
      capturedAt: payload.timestamp || row.createdAt,
      appName: payload.appName || "Desktop",
      activityPercent: typeof payload.activityPercent === "number" ? payload.activityPercent : null,
      imageUrl: `data:${mimeType};base64,${fs.readFileSync(resolved).toString("base64")}`,
    });
  }
  return previews;
}

export function registerSyncIpc(): void {
  ipcMain.handle("sync:enqueue", (_event, body: { kind?: string; payload?: unknown }) => {
    const kind = asKind(body?.kind);
    if (!kind || body.payload == null) return { ok: false };
    try {
      const id = enqueueOutbox(kind, body.payload);
      return { ok: id != null, id };
    } catch (error) {
      log.warn("[ipc:sync] enqueue failed", error);
      return { ok: false };
    }
  });

  ipcMain.handle("sync:list", (_event, kind?: string) => {
    try {
      return listOutbox(asKind(kind));
    } catch (error) {
      log.warn("[ipc:sync] list failed", error);
      return [];
    }
  });

  ipcMain.handle("sync:ack", (_event, ids: unknown) => {
    try {
      ackOutbox(Array.isArray(ids) ? ids.map((id) => Number(id)) : []);
      return { ok: true };
    } catch (error) {
      log.warn("[ipc:sync] ack failed", error);
      return { ok: false };
    }
  });

  ipcMain.handle("sync:clear", (_event, kind?: string) => {
    const parsed = asKind(kind);
    if (!parsed) return { ok: false };
    try {
      clearOutbox(parsed);
      return { ok: true };
    } catch (error) {
      log.warn("[ipc:sync] clear failed", error);
      return { ok: false };
    }
  });

  ipcMain.handle("sync:getBootId", () => getBootId());

  ipcMain.handle("sync:getSession", (_event, organizationId?: string) => {
    if (!organizationId) return null;
    try {
      return getOfflineSession(organizationId);
    } catch (error) {
      log.warn("[ipc:sync] getSession failed", error);
      return null;
    }
  });

  ipcMain.handle("sync:saveSession", (_event, session: OfflineSession) => {
    if (!session?.organizationId || !session.status) return { ok: false };
    try {
      saveOfflineSession(session);
      return { ok: true };
    } catch (error) {
      log.warn("[ipc:sync] saveSession failed", error);
      return { ok: false };
    }
  });

  ipcMain.handle("sync:pendingScreenshots", () => {
    try {
      return listPendingScreenshotPreviews();
    } catch (error) {
      log.warn("[ipc:sync] pending screenshots failed", error);
      return [];
    }
  });

  ipcMain.handle("sync:flushScreenshots", async () => {
    try {
      return await TrackingService.getInstance().flushQueuedScreenshots();
    } catch (error) {
      log.warn("[ipc:sync] flush screenshots failed", error);
      return { ok: false, uploaded: 0 };
    }
  });
}
