/**
 * Offline work drawn on top of server data (src/lib/offline-overlay.ts):
 * queued app usage, queued screenshots and offline sessions, limited to the
 * day on screen and marked so screens keep them out of edit/delete.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  activity: [] as unknown[],
  shots: [] as unknown[],
  sessions: [] as unknown[],
  shotCalls: 0,
}));

vi.mock("@/services/electron", () => ({
  isElectron: () => true,
  getElectronAPI: () => ({
    sync: {
      list: async (kind: string) => (kind === "activity" ? h.activity : []),
      pendingScreenshots: async () => {
        h.shotCalls += 1;
        return h.shots;
      },
    },
  }),
}));
vi.mock("@/lib/offline-time", () => ({ listOfflineSessions: async () => h.sessions }));

import { addQueuedAppUsage, isOfflineRowId, loadOfflineOverlay } from "@/lib/offline-overlay";

const dayStart = Date.parse("2026-11-03T00:00:00.000Z");
const range = { startMs: dayStart, endMs: dayStart + 24 * 60 * 60 * 1000 };

beforeEach(() => {
  h.activity = [];
  h.shots = [];
  h.sessions = [];
  h.shotCalls = 0;
});

describe("loadOfflineOverlay", () => {
  it("turns queued app usage into timeline rows, skipping idle and other days", async () => {
    h.activity = [
      {
        payload: {
          activities: [
            {
              timestamp: "2026-11-03T09:00:00.000Z",
              appName: "Code",
              windowTitle: "a.ts",
              duration: 60,
              isIdle: false,
            },
            { timestamp: "2026-11-03T09:01:00.000Z", appName: "Code", duration: 60, isIdle: true },
            {
              timestamp: "2026-11-02T09:00:00.000Z",
              appName: "Slack",
              duration: 60,
              isIdle: false,
            },
          ],
        },
      },
      { payload: null },
    ];
    const overlay = await loadOfflineOverlay(range);
    expect(overlay.activity).toEqual([
      {
        app: "Code",
        window: "a.ts",
        start: "2026-11-03T09:00:00.000Z",
        end: "2026-11-03T09:01:00.000Z",
        duration: 60,
      },
    ]);
  });

  it("offline sessions become entries the screens can tell apart", async () => {
    h.sessions = [
      {
        sessionStartedAt: "2026-11-03T08:00:00.000Z",
        endedAt: "2026-11-03T09:00:00.000Z",
        seconds: 3000,
        day: "2026-11-03",
        description: "Design",
      },
    ];
    const [entry] = (await loadOfflineOverlay(range)).entries;
    expect(entry.duration).toBe(3000);
    expect(entry.description).toBe("Design");
    expect(isOfflineRowId(entry.id)).toBe(true);
    expect(isOfflineRowId("server-id")).toBe(false);
  });

  it("only loads screenshot previews when asked", async () => {
    h.shots = [
      {
        id: "local-1",
        capturedAt: "2026-11-03T10:00:00.000Z",
        appName: "Code",
        activityPercent: 50,
        imageUrl: "data:x",
      },
    ];
    await loadOfflineOverlay(range, { activity: true });
    expect(h.shotCalls).toBe(0);
    const overlay = await loadOfflineOverlay(range);
    expect(overlay.shots).toHaveLength(1);
    expect(overlay.shots[0].pendingUpload).toBe(true);
  });
});

describe("addQueuedAppUsage", () => {
  it("leaves server numbers alone when nothing is queued", () => {
    const rows = [{ appName: "Code", totalDuration: 100, percent: 77 }];
    expect(addQueuedAppUsage(rows, [])).toBe(rows);
  });

  it("adds queued time and works out the shares again", () => {
    const rows = [{ appName: "Code", totalDuration: 300, percent: 100 }];
    expect(
      addQueuedAppUsage(rows, [
        { app: "Slack", duration: 100 },
        { app: "Code", duration: 0 },
      ]),
    ).toEqual([
      { appName: "Code", totalDuration: 300, percent: 75 },
      { appName: "Slack", totalDuration: 100, percent: 25 },
    ]);
  });
});
