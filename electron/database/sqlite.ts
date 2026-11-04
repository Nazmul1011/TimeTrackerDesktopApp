/**
 * SQLite database initialization via better-sqlite3.
 * The offline outbox tables are created in `outbox.ts`.
 *
 * better-sqlite3 is an optionalDependency because it requires a native build
 * (and electron-rebuild for the Electron runtime). If unavailable, the app
 * still boots; call sites should treat getDatabase() failures gracefully.
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
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type BetterSqlite3 = new (filename: string) => SqliteDatabase;

let db: SqliteDatabase | null = null;

function loadBetterSqlite3(): BetterSqlite3 | null {
  try {
    // Dynamic require so TypeScript / Next builds succeed without the native addon
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("better-sqlite3") as BetterSqlite3;
  } catch (error) {
    log.warn(
      "[sqlite] better-sqlite3 is not available. Run: npm i better-sqlite3 && npx electron-rebuild -f -w better-sqlite3",
      error,
    );
    return null;
  }
}

/** Offline queue lives on the drive the app is running from, not the Windows profile. */
export function offlineDataDir(): string {
  const drive = path.parse(app.getAppPath()).root;
  return path.join(drive, "Gr8rTimeTracker", "data");
}

export function initDatabase(): SqliteDatabase | null {
  if (db) return db;

  const Database = loadBetterSqlite3();
  if (!Database) return null;

  try {
    const dbDir = offlineDataDir();

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, "timetracker.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    log.info(`[sqlite] Database opened at ${dbPath}`);
    return db;
  } catch (error) {
    log.warn("[sqlite] Failed to open database", error);
    return null;
  }
}

export function getDatabase(): SqliteDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log.info("[sqlite] Database closed");
  }
}
