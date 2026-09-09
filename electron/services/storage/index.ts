/**
 * Persistent desktop storage via electron-store (survives app restarts).
 * Auth must live here — production serves the renderer on a new localhost
 * port each launch, so Chromium localStorage is a different origin every time.
 */
import log from "electron-log/main";

export type PersistedAuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null;
  organizationId: string | null;
  deviceId: string | null;
};

type StoreSchema = {
  settings: Record<string, unknown>;
  auth: PersistedAuthSession;
};

const EMPTY_AUTH: PersistedAuthSession = {
  accessToken: null,
  refreshToken: null,
  sessionToken: null,
  organizationId: null,
  deviceId: null,
};

type StoreLike = {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
};

function normalizeAuth(raw: unknown): PersistedAuthSession {
  if (!raw || typeof raw !== "object") return { ...EMPTY_AUTH };
  const value = raw as Record<string, unknown>;
  const asString = (key: string) =>
    typeof value[key] === "string" && value[key] ? (value[key] as string) : null;
  return {
    accessToken: asString("accessToken"),
    refreshToken: asString("refreshToken"),
    sessionToken: asString("sessionToken"),
    organizationId: asString("organizationId"),
    deviceId: asString("deviceId"),
  };
}

export class StorageService {
  private static instance: StorageService | null = null;
  private store: StoreLike | null = null;
  private memory: StoreSchema = {
    settings: {},
    auth: { ...EMPTY_AUTH },
  };

  private constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Store = require("electron-store") as new (options: unknown) => StoreLike;
      this.store = new Store({
        name: "gr8r-timetracker",
        defaults: this.memory,
      });
      log.info("[StorageService] Initialized electron-store");
    } catch (error) {
      log.warn("[StorageService] Falling back to in-memory store", error);
    }
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  getSettings(): Record<string, unknown> {
    return this.store?.get("settings") ?? this.memory.settings;
  }

  setSettings(settings: Record<string, unknown>): void {
    if (this.store) {
      this.store.set("settings", settings);
    } else {
      this.memory.settings = settings;
    }
  }

  getAuthSession(): PersistedAuthSession {
    return normalizeAuth(this.store?.get("auth") ?? this.memory.auth);
  }

  setAuthSession(session: PersistedAuthSession): void {
    const next = normalizeAuth(session);
    if (this.store) {
      this.store.set("auth", next);
    } else {
      this.memory.auth = next;
    }
  }

  clearAuthSession(): void {
    this.setAuthSession({ ...EMPTY_AUTH });
  }
}
