/**
 * Storage Service — empty stub wrapping electron-store.
 */
import log from "electron-log/main";

type StoreSchema = {
  settings: Record<string, unknown>;
  authToken: string | null;
};

type StoreLike = {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
};

export class StorageService {
  private static instance: StorageService | null = null;
  private store: StoreLike | null = null;
  private memory: StoreSchema = {
    settings: {},
    authToken: null,
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
    return this.store?.get("authToken") ?? this.memory.authToken;
  }

  setAuthToken(token: string | null): void {
    if (this.store) {
      this.store.set("authToken", token);
    } else {
      this.memory.authToken = token;
    }
  }
}
