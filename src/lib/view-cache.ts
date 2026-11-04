/**
 * Last copy of what each screen loaded from the server, kept on this laptop
 * so the app still shows the user's day while offline.
 *
 * - Scoped to the signed-in user and organization: another account or org
 *   never sees this data.
 * - Old copies (more than MAX_AGE_DAYS) are dropped, and everything is
 *   removed on logout (screenshots and app names are private).
 * - The server stays the source of truth: a successful load always
 *   overwrites the copy.
 *
 * Reads the user and org straight from localStorage, not from the auth
 * store, so the auth store can clear the cache without an import cycle.
 */
import { STORAGE_KEYS } from "@/constants/storage";

const PREFIX = "gr8r:cache:v1:";
const MAX_AGE_DAYS = 8;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
/** A single copy bigger than this is not worth the storage it takes. */
const MAX_ENTRY_CHARS = 1_500_000;

export type CachedView<T> = { data: T; savedAt: number };

type Envelope = { savedAt: number; data: unknown };

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** "<userId>:<orgId>", or null when nobody is signed in. */
function currentScope(): string | null {
  const store = storage();
  if (!store) return null;
  const orgId = store.getItem(STORAGE_KEYS.ORGANIZATION_ID);
  let userId: string | null = null;
  try {
    const raw = store.getItem(STORAGE_KEYS.AUTH_USER);
    userId = raw ? ((JSON.parse(raw) as { id?: string } | null)?.id ?? null) : null;
  } catch {
    userId = null;
  }
  return orgId && userId ? `${userId}:${orgId}` : null;
}

function keyFor(name: string, param: string): string | null {
  const scope = currentScope();
  return scope ? `${PREFIX}${scope}:${name}:${param}` : null;
}

function cacheKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

function savedAtOf(store: Storage, key: string): number {
  try {
    const parsed = JSON.parse(store.getItem(key) ?? "") as Envelope;
    return typeof parsed.savedAt === "number" ? parsed.savedAt : 0;
  } catch {
    return 0;
  }
}

/** Drops copies older than MAX_AGE_DAYS, or the oldest half when storage is full. */
function prune(store: Storage, mode: "expired" | "make-room"): void {
  const entries = cacheKeys(store).map((key) => ({ key, savedAt: savedAtOf(store, key) }));
  if (mode === "expired") {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const entry of entries) {
      if (entry.savedAt < cutoff) store.removeItem(entry.key);
    }
    return;
  }
  entries.sort((a, b) => a.savedAt - b.savedAt);
  for (const entry of entries.slice(0, Math.max(1, Math.ceil(entries.length / 2)))) {
    store.removeItem(entry.key);
  }
}

let prunedThisSession = false;

export function readCachedView<T>(name: string, param = "-"): CachedView<T> | null {
  const store = storage();
  const key = keyFor(name, param);
  if (!store || !key) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Envelope;
    if (typeof parsed?.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    return { data: parsed.data as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/** Best effort: a full or broken storage never breaks the screen that called it. */
export function writeCachedView<T>(name: string, param: string, data: T): void {
  const store = storage();
  const key = keyFor(name, param);
  if (!store || !key) return;
  let raw: string;
  try {
    raw = JSON.stringify({ savedAt: Date.now(), data } satisfies Envelope);
  } catch {
    return;
  }
  if (raw.length > MAX_ENTRY_CHARS) return;
  if (!prunedThisSession) {
    prunedThisSession = true;
    try {
      prune(store, "expired");
    } catch {
      // ignore
    }
  }
  try {
    store.setItem(key, raw);
  } catch {
    try {
      prune(store, "make-room");
      store.setItem(key, raw);
    } catch {
      // Storage still full: skip this copy.
    }
  }
}

export function removeCachedView(name: string, param = "-"): void {
  const store = storage();
  const key = keyFor(name, param);
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    // ignore
  }
}

/** Logout: remove every saved copy, for every account on this laptop. */
export function clearViewCache(): void {
  const store = storage();
  if (!store) return;
  try {
    for (const key of cacheKeys(store)) store.removeItem(key);
  } catch {
    // ignore
  }
}
