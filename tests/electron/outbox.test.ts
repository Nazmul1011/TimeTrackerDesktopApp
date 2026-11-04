/**
 * Characterization tests for the offline outbox (electron/database/outbox.ts).
 * Uses a real in-memory SQLite database; only the file location is faked.
 */
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  db: null as unknown,
  dataDir: "",
}));

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../electron/database/sqlite", () => ({
  initDatabase: () => state.db,
  offlineDataDir: () => state.dataDir,
}));

type OutboxModule = typeof import("../../electron/database/outbox");

async function loadOutbox(): Promise<OutboxModule> {
  vi.resetModules();
  return import("../../electron/database/outbox");
}

describe("offline outbox", () => {
  let outbox: OutboxModule;

  beforeEach(async () => {
    state.db = new Database(":memory:");
    state.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "gr8r-outbox-"));
    outbox = await loadOutbox();
  });

  afterEach(() => {
    (state.db as Database.Database | null)?.close();
    fs.rmSync(state.dataDir, { recursive: true, force: true });
  });

  it("returns rows in insertion order with payload parsed", () => {
    outbox.enqueueOutbox("timer", { action: "start", at: "2026-11-03T09:00:00.000Z" });
    outbox.enqueueOutbox("timer", { action: "pause", at: "2026-11-03T09:30:00.000Z" });
    outbox.enqueueOutbox("timer", { action: "resume", at: "2026-11-03T09:40:00.000Z" });

    const rows = outbox.listOutbox("timer");
    expect(rows.map((r) => (r.payload as { action: string }).action)).toEqual([
      "start",
      "pause",
      "resume",
    ]);
    expect(rows.every((r) => r.kind === "timer")).toBe(true);
    expect(rows.every((r) => !Number.isNaN(Date.parse(r.createdAt)))).toBe(true);
  });

  it("keeps the original event time inside the payload", () => {
    const occurredAt = "2026-01-01T08:00:00.000Z";
    outbox.enqueueOutbox("timer", { action: "start", occurredAt });
    expect((outbox.listOutbox("timer")[0].payload as { occurredAt: string }).occurredAt).toBe(
      occurredAt,
    );
  });

  it("filters by kind, and lists all kinds when none is given", () => {
    outbox.enqueueOutbox("timer", { n: 1 });
    outbox.enqueueOutbox("activity", { n: 2 });
    outbox.enqueueOutbox("screenshot", { n: 3 });

    expect(outbox.listOutbox("activity")).toHaveLength(1);
    expect(outbox.listOutbox().map((r) => r.kind)).toEqual(["timer", "activity", "screenshot"]);
  });

  it("ack removes only the given ids and ignores junk ids", () => {
    const a = outbox.enqueueOutbox("timer", { n: 1 })!;
    const b = outbox.enqueueOutbox("timer", { n: 2 })!;
    const c = outbox.enqueueOutbox("timer", { n: 3 })!;

    outbox.ackOutbox([a, c, a, Number.NaN]);
    expect(outbox.listOutbox("timer").map((r) => r.id)).toEqual([b]);

    outbox.ackOutbox([]);
    expect(outbox.listOutbox("timer")).toHaveLength(1);
  });

  it("clear removes one kind only", () => {
    outbox.enqueueOutbox("timer", {});
    outbox.enqueueOutbox("activity", {});
    outbox.clearOutbox("timer");
    expect(outbox.listOutbox().map((r) => r.kind)).toEqual(["activity"]);
  });

  it("skips rows whose payload is not valid JSON instead of throwing", () => {
    outbox.enqueueOutbox("timer", { ok: true });
    (state.db as Database.Database)
      .prepare(`INSERT INTO outbox (kind, payload, created_at) VALUES ('timer', '{broken', ?)`)
      .run(new Date().toISOString());

    expect(outbox.listOutbox("timer")).toHaveLength(1);
  });

  it("saves one session per organization and stamps it with this boot id", () => {
    const base = {
      organizationId: "org-1",
      status: "running" as const,
      startedAt: "2026-11-03T09:00:00.000Z",
      lastEventAt: "2026-11-03T09:05:00.000Z",
      projectId: "p-1",
      description: "work",
      bootId: "ignored-by-save",
    };
    outbox.saveOfflineSession(base);
    outbox.saveOfflineSession({
      ...base,
      status: "paused",
      lastEventAt: "2026-11-03T09:10:00.000Z",
    });

    const saved = outbox.getOfflineSession("org-1");
    expect(saved).toMatchObject({ status: "paused", lastEventAt: "2026-11-03T09:10:00.000Z" });
    expect(saved?.bootId).toBe(outbox.getBootId());
    expect(outbox.getOfflineSession("org-2")).toBeNull();
  });

  it("a new process gets a new boot id, so the old session is detectable after a crash", async () => {
    outbox.saveOfflineSession({
      organizationId: "org-1",
      status: "running",
      startedAt: null,
      lastEventAt: null,
      projectId: null,
      description: null,
      bootId: null,
    });
    const firstBoot = outbox.getBootId();

    const afterRestart = await loadOutbox();
    expect(afterRestart.getBootId()).not.toBe(firstBoot);
    expect(afterRestart.getOfflineSession("org-1")?.bootId).toBe(firstBoot);
  });

  it("reads an unknown stored status as idle", () => {
    outbox.listOutbox(); // creates the schema
    (state.db as Database.Database)
      .prepare(`INSERT INTO offline_session (organization_id, status) VALUES ('org-x', 'weird')`)
      .run();
    expect(outbox.getOfflineSession("org-x")?.status).toBe("idle");
  });

  it("does nothing (and does not throw) when SQLite is unavailable", async () => {
    (state.db as Database.Database).close();
    state.db = null;
    const noDb = await loadOutbox();
    expect(noDb.enqueueOutbox("timer", {})).toBeNull();
    expect(noDb.listOutbox()).toEqual([]);
    expect(noDb.getOfflineSession("org-1")).toBeNull();
    expect(() => noDb.ackOutbox([1])).not.toThrow();
  });

  it("creates the offline screenshot folder on demand and counts files in it", () => {
    const dir = outbox.offlineScreenshotDir();
    expect(dir).toBe(path.join(state.dataDir, "offline-screenshots"));
    expect(outbox.countScreenshotFiles()).toBe(0);
    fs.writeFileSync(path.join(dir, "a.jpg"), "x");
    expect(outbox.countScreenshotFiles()).toBe(1);
  });
});
