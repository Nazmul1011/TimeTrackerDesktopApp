/**
 * Storage Service — electron-store for settings + durable auth session.
 * Auth must live here so Quit/reopen keeps the user signed in even if the
 * renderer origin/port changes.
 */
import log from "electron-log/main";

export type PersistedAuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null;
  organizationId: string | null;
  user: unknown | null;
  organizations: unknown[] | null;
};

type StoreSchema = {
  settings: Record<string, unknown>;
  authToken: string | null;
  authSession: PersistedAuthSession | null;
};

type StoreLike = {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
  delete: (key: keyof StoreSchema) => void;
};

const EMPTY_SESSION: PersistedAuthSession = {
  accessToken: null,
  refreshToken: null,
  sessionToken: null,
  organizationId: null,
  user: null,
  organizations: null,
};

export class StorageService {
  private static instance: StorageService | null = null;
  private store: StoreLike | null = null;
  private memory: StoreSchema = {
    settings: {},
    authToken: null,
    authSession: null,
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

  getAuthToken(): string | null {
    const session = this.getAuthSession();
    if (session?.accessToken) return session.accessToken;
    return this.store?.get("authToken") ?? this.memory.authToken;
  }

  setAuthToken(token: string | null): void {
    if (this.store) {
      this.store.set("authToken", token);
    } else {
      this.memory.authToken = token;
    }
  }

  getAuthSession(): PersistedAuthSession | null {
    const raw = this.store?.get("authSession") ?? this.memory.authSession;
    if (!raw || typeof raw !== "object") return null;
    return {
      ...EMPTY_SESSION,
      ...raw,
    };
  }

  setAuthSession(session: PersistedAuthSession | null): void {
    if (this.store) {
      this.store.set("authSession", session);
      this.store.set("authToken", session?.accessToken ?? null);
    } else {
      this.memory.authSession = session;
      this.memory.authToken = session?.accessToken ?? null;
    }
    log.info(`[StorageService] auth session ${session?.accessToken ? "saved" : "cleared"}`);
  }

  clearAuthSession(): void {
    this.setAuthSession(null);
  }
}
