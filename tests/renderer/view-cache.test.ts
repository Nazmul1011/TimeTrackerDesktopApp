/**
 * Saved copies of screens (src/lib/view-cache.ts): kept per user and org,
 * dropped when old, removed on logout, and never a reason for a crash.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  map = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites && key.startsWith("gr8r:cache:")) {
      throw new DOMException("full", "QuotaExceededError");
    }
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

let storage: MemoryStorage;

function signIn(userId: string, orgId: string) {
  storage.setItem("authUser", JSON.stringify({ id: userId }));
  storage.setItem("organizationId", orgId);
}

async function load() {
  vi.resetModules();
  return import("@/lib/view-cache");
}

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
  signIn("u1", "org-a");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("view cache", () => {
  it("returns what was saved, with the time it was saved", async () => {
    const cache = await load();
    cache.writeCachedView("timesheetToday", "2026-11-03", [{ id: "e1" }]);
    const saved = cache.readCachedView<Array<{ id: string }>>("timesheetToday", "2026-11-03");
    expect(saved?.data).toEqual([{ id: "e1" }]);
    expect(typeof saved?.savedAt).toBe("number");
    expect(cache.readCachedView("timesheetToday", "2026-11-04")).toBeNull();
  });

  it("another org or another user never sees the copy", async () => {
    const cache = await load();
    cache.writeCachedView("summary", "-", { hours: 5 });

    signIn("u1", "org-b");
    expect(cache.readCachedView("summary")).toBeNull();

    signIn("u2", "org-a");
    expect(cache.readCachedView("summary")).toBeNull();

    signIn("u1", "org-a");
    expect(cache.readCachedView("summary")?.data).toEqual({ hours: 5 });
  });

  it("saves nothing while nobody is signed in", async () => {
    storage.clear();
    const cache = await load();
    cache.writeCachedView("summary", "-", { hours: 5 });
    expect(storage.length).toBe(0);
    expect(cache.readCachedView("summary")).toBeNull();
  });

  it("drops copies older than 8 days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T10:00:00Z"));
    const cache = await load();
    cache.writeCachedView("timelineDay", "2026-11-01", { entries: [] });

    vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
    expect(cache.readCachedView("timelineDay", "2026-11-01")).not.toBeNull();

    vi.setSystemTime(new Date("2026-11-09T11:00:00Z"));
    expect(cache.readCachedView("timelineDay", "2026-11-01")).toBeNull();
  });

  it("logout removes every saved copy but nothing else", async () => {
    const cache = await load();
    cache.writeCachedView("summary", "-", 1);
    signIn("u2", "org-b");
    cache.writeCachedView("summary", "-", 2);
    storage.setItem("theme", "dark");

    cache.clearViewCache();
    expect([...storage.map.keys()].filter((key) => key.startsWith("gr8r:cache:"))).toEqual([]);
    expect(storage.getItem("theme")).toBe("dark");
  });

  it("a full storage never throws", async () => {
    const cache = await load();
    storage.failWrites = true;
    expect(() => cache.writeCachedView("summary", "-", { hours: 1 })).not.toThrow();
    expect(cache.readCachedView("summary")).toBeNull();
  });

  it("a broken saved value reads as no copy", async () => {
    const cache = await load();
    cache.writeCachedView("summary", "-", 1);
    const key = [...storage.map.keys()].find((k) => k.startsWith("gr8r:cache:"))!;
    storage.map.set(key, "{not json");
    expect(cache.readCachedView("summary")).toBeNull();
  });
});
