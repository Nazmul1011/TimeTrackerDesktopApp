/**
 * Durable offline outbox for timer events, activity samples, and screenshots.
 * SQLite when available; JSON file otherwise.
 */
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import log from "electron-log/main";
import { getDatabase, getUserDataDir } from "../../database/sqlite";

export type TimerEventType = "start" | "pause" | "resume" | "stop";

export type TimerEventRow = {
  id: string;
  seq: number;
  type: TimerEventType;
  occurredAt: string;
  projectId: string | null;
  description: string | null;
  status: "pending" | "synced" | "failed";
  error: string | null;
};

export type LocalTimerSnapshot = {
  status: "idle" | "running" | "paused";
  localId: string | null;
  serverId: string | null;
  projectId: string | null;
  description: string;
  startedAt: string | null;
  elapsedMs: number;
  baseElapsedMs: number;
  segmentStartedAt: number | null;
  isOffline: boolean;
  todayLoggedMs: number;
  todayDate: string | null;
};

export type ScreenshotOutboxRow = {
  id: string;
  filePath: string;
  timestamp: string;
  appName: string;
  windowTitle: string;
  mimeType: string;
  activityPercent: number;
  status: string;
};

type JsonStore = {
  timerEvents: TimerEventRow[];
  localTimer: LocalTimerSnapshot | null;
  activities: Array<{ id: string; payload: unknown; status: string; createdAt: string }>;
  screenshots: ScreenshotOutboxRow[];
};

const EMPTY_JSON: JsonStore = {
  timerEvents: [],
  localTimer: null,
  activities: [],
  screenshots: [],
};

function jsonPath(): string {
  return path.join(getUserDataDir(), "offline-queue.json");
}

function readJson(): JsonStore {
  try {
    const raw = fs.readFileSync(jsonPath(), "utf8");
    return { ...EMPTY_JSON, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_JSON, timerEvents: [], activities: [], screenshots: [] };
  }
}

function writeJson(store: JsonStore) {
  fs.writeFileSync(jsonPath(), JSON.stringify(store, null, 0), "utf8");
}

export class OfflineQueue {
  private static instance: OfflineQueue | null = null;

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) {
      OfflineQueue.instance = new OfflineQueue();
    }
    return OfflineQueue.instance;
  }

  enqueueTimerEvent(input: {
    type: TimerEventType;
    occurredAt: string;
    projectId?: string | null;
    description?: string | null;
  }): TimerEventRow {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const db = getDatabase();
    if (db) {
      const row = db.prepare(
        "SELECT COALESCE(MAX(seq), 0) AS maxSeq FROM timer_events",
      ).get() as { maxSeq: number };
      const seq = Number(row?.maxSeq ?? 0) + 1;
      db.prepare(
        `INSERT INTO timer_events (id, seq, type, occurred_at, project_id, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(
        id,
        seq,
        input.type,
        input.occurredAt,
        input.projectId ?? null,
        input.description ?? null,
        createdAt,
      );
      return {
        id,
        seq,
        type: input.type,
        occurredAt: input.occurredAt,
        projectId: input.projectId ?? null,
        description: input.description ?? null,
        status: "pending",
        error: null,
      };
    }

    const store = readJson();
    const seq =
      store.timerEvents.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
    const event: TimerEventRow = {
      id,
      seq,
      type: input.type,
      occurredAt: input.occurredAt,
      projectId: input.projectId ?? null,
      description: input.description ?? null,
      status: "pending",
      error: null,
    };
    store.timerEvents.push(event);
    writeJson(store);
    return event;
  }

  listPendingTimerEvents(): TimerEventRow[] {
    const db = getDatabase();
    if (db) {
      const rows = db.prepare(
        `SELECT id, seq, type, occurred_at AS occurredAt, project_id AS projectId,
                description, status, error
         FROM timer_events WHERE status = 'pending' ORDER BY seq ASC`,
      ).all() as TimerEventRow[];
      return rows;
    }
    return readJson()
      .timerEvents.filter((event) => event.status === "pending")
      .sort((a, b) => a.seq - b.seq);
  }

  markTimerEventSynced(id: string) {
    const db = getDatabase();
    if (db) {
      db.prepare(
        "UPDATE timer_events SET status = 'synced', error = NULL WHERE id = ?",
      ).run(id);
      return;
    }
    const store = readJson();
    store.timerEvents = store.timerEvents.map((event) =>
      event.id === id ? { ...event, status: "synced" as const, error: null } : event,
    );
    writeJson(store);
  }

  markTimerEventFailed(id: string, error: string) {
    const db = getDatabase();
    if (db) {
      db.prepare(
        "UPDATE timer_events SET status = 'failed', error = ? WHERE id = ?",
      ).run(error, id);
      return;
    }
    const store = readJson();
    store.timerEvents = store.timerEvents.map((event) =>
      event.id === id ? { ...event, status: "failed" as const, error } : event,
    );
    writeJson(store);
  }

  pendingTimerEventCount(): number {
    return this.listPendingTimerEvents().length;
  }

  saveLocalTimer(snapshot: LocalTimerSnapshot) {
    const updatedAt = new Date().toISOString();
    const db = getDatabase();
    if (db) {
      db.prepare(
        `INSERT INTO local_timer (
           id, status, local_id, server_id, project_id, description, started_at,
           elapsed_ms, base_elapsed_ms, segment_started_at, is_offline,
           today_logged_ms, today_date, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           local_id = excluded.local_id,
           server_id = excluded.server_id,
           project_id = excluded.project_id,
           description = excluded.description,
           started_at = excluded.started_at,
           elapsed_ms = excluded.elapsed_ms,
           base_elapsed_ms = excluded.base_elapsed_ms,
           segment_started_at = excluded.segment_started_at,
           is_offline = excluded.is_offline,
           today_logged_ms = excluded.today_logged_ms,
           today_date = excluded.today_date,
           updated_at = excluded.updated_at`,
      ).run(
        snapshot.status,
        snapshot.localId,
        snapshot.serverId,
        snapshot.projectId,
        snapshot.description,
        snapshot.startedAt,
        snapshot.elapsedMs,
        snapshot.baseElapsedMs,
        snapshot.segmentStartedAt,
        snapshot.isOffline ? 1 : 0,
        snapshot.todayLoggedMs ?? 0,
        snapshot.todayDate ?? null,
        updatedAt,
      );
      return;
    }
    const store = readJson();
    store.localTimer = snapshot;
    writeJson(store);
  }

  getLocalTimer(): LocalTimerSnapshot | null {
    const db = getDatabase();
    if (db) {
      const row = db.prepare(
        `SELECT status, local_id AS localId, server_id AS serverId, project_id AS projectId,
                description, started_at AS startedAt, elapsed_ms AS elapsedMs,
                base_elapsed_ms AS baseElapsedMs, segment_started_at AS segmentStartedAt,
                is_offline AS isOffline, today_logged_ms AS todayLoggedMs, today_date AS todayDate
         FROM local_timer WHERE id = 1`,
      ).get() as
        | (Omit<LocalTimerSnapshot, "isOffline"> & { isOffline: number })
        | undefined;
      if (!row) return null;
      return {
        ...row,
        isOffline: Boolean(row.isOffline),
        todayLoggedMs: Number(row.todayLoggedMs ?? 0),
        todayDate: row.todayDate ?? null,
      };
    }
    const snap = readJson().localTimer;
    if (!snap) return null;
    return {
      ...snap,
      todayLoggedMs: Number(snap.todayLoggedMs ?? 0),
      todayDate: snap.todayDate ?? null,
    };
  }

  enqueueActivities(payloads: unknown[]) {
    if (!payloads.length) return;
    const createdAt = new Date().toISOString();
    const db = getDatabase();
    if (db) {
      const stmt = db.prepare(
        `INSERT INTO outbox_activities (id, payload, status, created_at) VALUES (?, ?, 'pending', ?)`,
      );
      for (const payload of payloads) {
        stmt.run(randomUUID(), JSON.stringify(payload), createdAt);
      }
      return;
    }
    const store = readJson();
    for (const payload of payloads) {
      store.activities.push({
        id: randomUUID(),
        payload,
        status: "pending",
        createdAt,
      });
    }
    writeJson(store);
  }

  listPendingActivities(limit = 80): Array<{ id: string; payload: unknown }> {
    const db = getDatabase();
    if (db) {
      const rows = db.prepare(
        `SELECT id, payload FROM outbox_activities WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      ).all(limit) as Array<{ id: string; payload: string }>;
      return rows.map((row) => ({
        id: row.id,
        payload: JSON.parse(row.payload) as unknown,
      }));
    }
    return readJson()
      .activities.filter((row) => row.status === "pending")
      .slice(0, limit)
      .map((row) => ({ id: row.id, payload: row.payload }));
  }

  markActivitiesSynced(ids: string[]) {
    if (!ids.length) return;
    const db = getDatabase();
    if (db) {
      const stmt = db.prepare(
        "UPDATE outbox_activities SET status = 'synced' WHERE id = ?",
      );
      for (const id of ids) stmt.run(id);
      return;
    }
    const store = readJson();
    const idSet = new Set(ids);
    store.activities = store.activities.map((row) =>
      idSet.has(row.id) ? { ...row, status: "synced" } : row,
    );
    writeJson(store);
  }

  pendingActivityCount(): number {
    const db = getDatabase();
    if (db) {
      const row = db.prepare(
        "SELECT COUNT(*) AS count FROM outbox_activities WHERE status = 'pending'",
      ).get() as { count: number };
      return Number(row?.count ?? 0);
    }
    return readJson().activities.filter((row) => row.status === "pending").length;
  }

  enqueueScreenshot(input: {
    filePath: string;
    timestamp: string;
    appName: string;
    windowTitle: string;
    mimeType: string;
    activityPercent: number;
  }): string {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const db = getDatabase();
    if (db) {
      db.prepare(
        `INSERT INTO outbox_screenshots (
           id, file_path, timestamp, app_name, window_title, mime_type, activity_percent, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(
        id,
        input.filePath,
        input.timestamp,
        input.appName,
        input.windowTitle,
        input.mimeType,
        input.activityPercent,
        createdAt,
      );
      return id;
    }
    const store = readJson();
    store.screenshots.push({
      id,
      filePath: input.filePath,
      timestamp: input.timestamp,
      appName: input.appName,
      windowTitle: input.windowTitle,
      mimeType: input.mimeType,
      activityPercent: input.activityPercent,
      status: "pending",
    });
    writeJson(store);
    return id;
  }

  listPendingScreenshots(limit = 8): ScreenshotOutboxRow[] {
    const db = getDatabase();
    if (db) {
      return db.prepare(
        `SELECT id, file_path AS filePath, timestamp, app_name AS appName,
                window_title AS windowTitle, mime_type AS mimeType,
                activity_percent AS activityPercent, status
         FROM outbox_screenshots WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
      ).all(limit) as ScreenshotOutboxRow[];
    }
    return readJson()
      .screenshots.filter((row) => row.status === "pending")
      .slice(0, limit);
  }

  markScreenshotSynced(id: string) {
    const db = getDatabase();
    if (db) {
      const row = db.prepare(
        "SELECT file_path AS filePath FROM outbox_screenshots WHERE id = ?",
      ).get() as { filePath: string } | undefined;
      db.prepare(
        "UPDATE outbox_screenshots SET status = 'synced' WHERE id = ?",
      ).run(id);
      if (row?.filePath) {
        fs.unlink(row.filePath, () => undefined);
      }
      return;
    }
    const store = readJson();
    const found = store.screenshots.find((row) => row.id === id);
    store.screenshots = store.screenshots.map((row) =>
      row.id === id ? { ...row, status: "synced" } : row,
    );
    writeJson(store);
    if (found?.filePath) {
      fs.unlink(found.filePath, () => undefined);
    }
  }

  pendingScreenshotCount(): number {
    const db = getDatabase();
    if (db) {
      const row = db.prepare(
        "SELECT COUNT(*) AS count FROM outbox_screenshots WHERE status = 'pending'",
      ).get() as { count: number };
      return Number(row?.count ?? 0);
    }
    return readJson().screenshots.filter((row) => row.status === "pending").length;
  }

  getPendingCounts() {
    return {
      timer: this.pendingTimerEventCount(),
      activity: this.pendingActivityCount(),
      screenshots: this.pendingScreenshotCount(),
    };
  }

  screenshotDir(): string {
    const dir = path.join(getUserDataDir(), "offline-screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}

log.info("[OfflineQueue] ready");
