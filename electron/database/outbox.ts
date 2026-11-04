/**
 * Durable queue for timer, activity, and screenshot events the server
 * has not accepted yet. Survives quit, crash, and a laptop restart.
 * A powered-off machine still cannot record time after the process dies;
 * the next launch closes the session at the last saved moment.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import log from "electron-log/main";
import { initDatabase, offlineDataDir, type SqliteDatabase } from "./sqlite";

export type OutboxKind = "timer" | "activity" | "screenshot";

export type OutboxRow = {
  id: number;
  kind: OutboxKind;
  payload: unknown;
  createdAt: string;
};

export type OfflineSession = {
  organizationId: string;
  status: "running" | "paused" | "idle";
  startedAt: string | null;
  lastEventAt: string | null;
  projectId: string | null;
  description: string | null;
  bootId: string | null;
};

const bootId = randomUUID();

export function getBootId(): string {
  return bootId;
}

function database(): SqliteDatabase | null {
  return initDatabase();
}

let schemaReady = false;

export function ensureOutboxSchema(db: SqliteDatabase): void {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_kind_id ON outbox(kind, id);

    CREATE TABLE IF NOT EXISTS offline_session (
      organization_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at TEXT,
      last_event_at TEXT,
      project_id TEXT,
      description TEXT,
      boot_id TEXT
    );
  `);
  schemaReady = true;
}

function open(): SqliteDatabase | null {
  const db = database();
  if (!db) return null;
  try {
    ensureOutboxSchema(db);
    return db;
  } catch (error) {
    log.warn("[outbox] schema failed", error);
    return null;
  }
}

export function enqueueOutbox(kind: OutboxKind, payload: unknown): number | null {
  const db = open();
  if (!db) return null;
  const result = db
    .prepare(`INSERT INTO outbox (kind, payload, created_at) VALUES (?, ?, ?)`)
    .run(kind, JSON.stringify(payload), new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function listOutbox(kind?: OutboxKind): OutboxRow[] {
  const db = open();
  if (!db) return [];
  const rows = (
    kind
      ? db
          .prepare(
            `SELECT id, kind, payload, created_at FROM outbox WHERE kind = ? ORDER BY id ASC`,
          )
          .all(kind)
      : db.prepare(`SELECT id, kind, payload, created_at FROM outbox ORDER BY id ASC`).all()
  ) as Array<{ id: number; kind: string; payload: string; created_at: string }>;

  return rows.flatMap((row) => {
    try {
      return [
        {
          id: row.id,
          kind: row.kind as OutboxKind,
          payload: JSON.parse(row.payload) as unknown,
          createdAt: row.created_at,
        },
      ];
    } catch {
      return [];
    }
  });
}

export function ackOutbox(ids: number[]): void {
  const db = open();
  if (!db || ids.length === 0) return;
  const unique = [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  if (unique.length === 0) return;
  const marks = unique.map(() => "?").join(", ");
  db.prepare(`DELETE FROM outbox WHERE id IN (${marks})`).run(...unique);
}

export function clearOutbox(kind: OutboxKind): void {
  const db = open();
  if (!db) return;
  db.prepare(`DELETE FROM outbox WHERE kind = ?`).run(kind);
}

export function saveOfflineSession(session: OfflineSession): void {
  const db = open();
  if (!db) return;
  db.prepare(
    `INSERT INTO offline_session (
       organization_id, status, started_at, last_event_at, project_id, description, boot_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id) DO UPDATE SET
       status = excluded.status,
       started_at = excluded.started_at,
       last_event_at = excluded.last_event_at,
       project_id = excluded.project_id,
       description = excluded.description,
       boot_id = excluded.boot_id`,
  ).run(
    session.organizationId,
    session.status,
    session.startedAt,
    session.lastEventAt,
    session.projectId,
    session.description,
    bootId,
  );
}

export function getOfflineSession(organizationId: string): OfflineSession | null {
  const db = open();
  if (!db) return null;
  const row = db
    .prepare(
      `SELECT organization_id, status, started_at, last_event_at, project_id, description, boot_id
       FROM offline_session WHERE organization_id = ?`,
    )
    .get(organizationId) as
    | {
        organization_id: string;
        status: string;
        started_at: string | null;
        last_event_at: string | null;
        project_id: string | null;
        description: string | null;
        boot_id: string | null;
      }
    | undefined;
  if (!row) return null;
  const status = row.status === "running" || row.status === "paused" ? row.status : "idle";
  return {
    organizationId: row.organization_id,
    status,
    startedAt: row.started_at,
    lastEventAt: row.last_event_at,
    projectId: row.project_id,
    description: row.description,
    bootId: row.boot_id,
  };
}

export function offlineScreenshotDir(): string {
  const dir = path.join(offlineDataDir(), "offline-screenshots");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function countScreenshotFiles(): number {
  try {
    return fs.readdirSync(offlineScreenshotDir()).length;
  } catch {
    return 0;
  }
}
