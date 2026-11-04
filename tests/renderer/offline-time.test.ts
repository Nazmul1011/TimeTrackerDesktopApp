/**
 * Time stopped offline (src/lib/offline-time.ts): counted at once, and
 * dropped as soon as the upload queue no longer holds that session, so it
 * is never counted twice once the server has it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  queued: [] as Array<{ payload: { sessionStartedAt: string } }>,
  listFails: false,
}));

vi.mock("@/services/electron", () => ({
  isElectron: () => true,
  getElectronAPI: () => ({
    sync: {
      list: async () => {
        if (h.listFails) throw new Error("ipc down");
        return h.queued;
      },
    },
  }),
}));

class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

import {
  listOfflineSessions,
  offlineSecondsOn,
  recordOfflineSession,
  workedSecondsFromEvents,
} from "@/lib/offline-time";

const A = "2026-11-03T08:00:00.000Z";
const B = "2026-11-03T10:00:00.000Z";

beforeEach(() => {
  const storage = new MemoryStorage();
  storage.setItem("authUser", JSON.stringify({ id: "u1" }));
  storage.setItem("organizationId", "org-a");
  vi.stubGlobal("localStorage", storage);
  h.queued = [];
  h.listFails = false;
});

describe("offline sessions", () => {
  it("are kept while their clicks wait in the queue", async () => {
    h.queued = [{ payload: { sessionStartedAt: A } }, { payload: { sessionStartedAt: B } }];
    recordOfflineSession({ sessionStartedAt: A, endedAt: B, seconds: 3600, day: "2026-11-03" });
    recordOfflineSession({ sessionStartedAt: B, endedAt: B, seconds: 600, day: "2026-11-03" });

    const sessions = await listOfflineSessions();
    expect(sessions.map((s) => s.sessionStartedAt)).toEqual([A, B]);
    expect(offlineSecondsOn(sessions, "2026-11-03")).toBe(4200);
    expect(offlineSecondsOn(sessions, "2026-11-04")).toBe(0);
  });

  it("are dropped once uploaded, so the server's total is not doubled", async () => {
    h.queued = [{ payload: { sessionStartedAt: B } }];
    recordOfflineSession({ sessionStartedAt: A, endedAt: B, seconds: 3600, day: "2026-11-03" });
    recordOfflineSession({ sessionStartedAt: B, endedAt: B, seconds: 600, day: "2026-11-03" });

    expect((await listOfflineSessions()).map((s) => s.sessionStartedAt)).toEqual([B]);
    h.queued = [];
    expect(await listOfflineSessions()).toEqual([]);
  });

  it("are not dropped when the queue cannot be read", async () => {
    recordOfflineSession({ sessionStartedAt: A, endedAt: B, seconds: 60, day: "2026-11-03" });
    h.listFails = true;
    expect(await listOfflineSessions()).toHaveLength(1);
  });

  it("recording the same session again replaces it", async () => {
    h.queued = [{ payload: { sessionStartedAt: A } }];
    recordOfflineSession({ sessionStartedAt: A, endedAt: B, seconds: 60, day: "2026-11-03" });
    recordOfflineSession({ sessionStartedAt: A, endedAt: B, seconds: 90, day: "2026-11-03" });
    const sessions = await listOfflineSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].seconds).toBe(90);
  });

  it("ignores empty sessions", async () => {
    h.queued = [{ payload: { sessionStartedAt: A } }];
    recordOfflineSession({ sessionStartedAt: A, endedAt: A, seconds: 0, day: "2026-11-03" });
    expect(await listOfflineSessions()).toEqual([]);
  });
});

describe("workedSecondsFromEvents", () => {
  const at = (minutes: number) => new Date(Date.parse(A) + minutes * 60_000).toISOString();

  it("leaves pauses out", () => {
    expect(
      workedSecondsFromEvents([
        { kind: "start", occurredAt: at(0) },
        { kind: "pause", occurredAt: at(30) },
        { kind: "resume", occurredAt: at(45) },
        { kind: "stop", occurredAt: at(60) },
      ]),
    ).toBe(45 * 60);
  });

  it("works with clicks out of order and a stop while paused", () => {
    expect(
      workedSecondsFromEvents([
        { kind: "stop", occurredAt: at(60) },
        { kind: "pause", occurredAt: at(10) },
        { kind: "start", occurredAt: at(0) },
      ]),
    ).toBe(10 * 60);
  });

  it("gives no number when the real start is not in the queue", () => {
    expect(
      workedSecondsFromEvents([
        { kind: "pause", occurredAt: at(10) },
        { kind: "stop", occurredAt: at(20) },
      ]),
    ).toBeNull();
    expect(
      workedSecondsFromEvents([
        { kind: "start", occurredAt: at(0), synthetic: true },
        { kind: "stop", occurredAt: at(20) },
      ]),
    ).toBeNull();
  });
});
