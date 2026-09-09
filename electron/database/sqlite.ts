/**
 * SQLite via better-sqlite3, with a JSON-file fallback if the native addon is missing.
 */
import path from "path";
import { app } from "electron";
import log from "electron-log/main";
import fs from "fs";

export type SqliteStatement = {
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
};

export type SqliteDatabase = {
  pragma: (source: string) => unknown;
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type BetterSqlite3 = new (filename: string) => SqliteDatabase;

let db: SqliteDatabase | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS timer_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  project_id TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_timer_events_pending ON timer_events(status, seq);

CREATE TABLE IF NOT EXISTS local_timer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL,
  local_id TEXT,
  server_id TEXT,
  project_id TEXT,
  description TEXT,
  started_at TEXT,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  base_elapsed_ms INTEGER NOT NULL DEFAULT 0,
  segment_started_at INTEGER,
  is_offline INTEGER NOT NULL DEFAULT 0,
  today_logged_ms INTEGER NOT NULL DEFAULT 0,
  today_date TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_activities (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_activities_pending ON outbox_activities(status, created_at);

CREATE TABLE IF NOT EXISTS outbox_screenshots (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  app_name TEXT,
  window_title TEXT,
  mime_type TEXT,
  activity_percent REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_screenshots_pending ON outbox_screenshots(status, created_at);
`;

function loadBetterSqlite3(): BetterSqlite3 | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("better-sqlite3") as BetterSqlite3;
  } catch (error) {
    log.warn("[sqlite] better-sqlite3 is not available", error);
    return null;
  }
}

function migrateLocalTimer(database: SqliteDatabase) {
  const cols = database.prepare("PRAGMA table_info(local_timer)").all() as Array<{
    name: string;
  }>;
  const names = new Set(cols.map((col) => col.name));
  if (!names.has("today_logged_ms")) {
    database.exec(
      "ALTER TABLE local_timer ADD COLUMN today_logged_ms INTEGER NOT NULL DEFAULT 0",
    );
  }
  if (!names.has("today_date")) {
    database.exec("ALTER TABLE local_timer ADD COLUMN today_date TEXT");
  }
}

export function getUserDataDir(): string {
  const dir = path.join(app.getPath("userData"), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function initDatabase(): SqliteDatabase | null {
  if (db) return db;

  const Database = loadBetterSqlite3();
  if (!Database) return null;

  try {
    const dbPath = path.join(getUserDataDir(), "timetracker.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    migrateLocalTimer(db);
    log.info(`[sqlite] Database opened at ${dbPath}`);
    return db;
  } catch (error) {
    log.warn("[sqlite] Failed to open database", error);
    db = null;
    return null;
  }
}

export function getDatabase(): SqliteDatabase | null {
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info("[sqlite] Database closed");
  }
}
