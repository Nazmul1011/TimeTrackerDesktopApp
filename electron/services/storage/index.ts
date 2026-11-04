/**
 * Storage Service — electron-store for settings + durable auth session.
 * Auth must live here so Quit/reopen keeps the user signed in even if the
 * renderer origin/port changes.
 *
 * The auth session is encrypted with the OS keychain (safeStorage) when it is
 * available. A plaintext session from an older version is migrated on first
 * read, so users stay signed in. If encryption is not available (some Linux
 * setups), the session is stored as before.
 */
import { app, safeStorage } from "electron";
import log from "electron-log/main";
import { decryptSession, encryptSession, type SessionCipher } from "./secure-session";

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
  /** Legacy plaintext copy of the access token. Not written when encryption is on. */
  authToken: string | null;
  /** Legacy plaintext session. Migrated to `authSessionEnc` when encryption is on. */
  authSession: PersistedAuthSession | null;
  /** base64 safeStorage ciphertext of PersistedAuthSession. */
  authSessionEnc: string | null;
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

const osCipher: SessionCipher = {
  // safeStorage may only be used after the app is ready.
  isAvailable: () => app.isReady() && safeStorage.isEncryptionAvailable(),
  encrypt: (plain) => safeStorage.encryptString(plain),
  decrypt: (encrypted) => safeStorage.decryptString(encrypted),
};

function normalizeSession(raw: unknown): PersistedAuthSession | null {
  if (!raw || typeof raw !== "object") return null;
  return { ...EMPTY_SESSION, ...(raw as Partial<PersistedAuthSession>) };
}

export class StorageService {
  private static instance: StorageService | null = null;
  private store: StoreLike | null = null;
  private memory: StoreSchema = {
    settings: {},
    authToken: null,
    authSession: null,
    authSessionEnc: null,
  };

  /** Tests pass `useDiskStore = false` so nothing is written to the user's profile. */
  private constructor(
    private readonly cipher: SessionCipher = osCipher,
    useDiskStore = true,
  ) {
    if (!useDiskStore) return;
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

  private read<K extends keyof StoreSchema>(key: K): StoreSchema[K] {
    return this.store ? this.store.get(key) : this.memory[key];
  }

  private write<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void {
    if (this.store) {
      this.store.set(key, value);
    } else {
      this.memory[key] = value;
    }
  }

  getSettings(): Record<string, unknown> {
    return this.read("settings") ?? {};
  }

  setSettings(settings: Record<string, unknown>): void {
    this.write("settings", settings);
  }

  getAuthToken(): string | null {
    const session = this.getAuthSession();
    if (session?.accessToken) return session.accessToken;
    return this.read("authToken") ?? null;
  }

  setAuthToken(token: string | null): void {
    this.write("authToken", token);
  }

  getAuthSession(): PersistedAuthSession | null {
    const encrypted = this.read("authSessionEnc");
    if (encrypted) {
      const session = normalizeSession(decryptSession(this.cipher, encrypted));
      if (session) return session;
      log.warn("[StorageService] could not decrypt auth session — falling back to plaintext copy");
    }

    const legacy = normalizeSession(this.read("authSession"));
    if (legacy && this.cipher.isAvailable()) {
      // One-time migration from older versions: keep the user signed in.
      this.setAuthSession(legacy);
      log.info("[StorageService] migrated auth session to encrypted storage");
    }
    return legacy;
  }

  setAuthSession(session: PersistedAuthSession | null): void {
    const encrypted = session ? encryptSession(this.cipher, session) : null;

    if (encrypted) {
      this.write("authSessionEnc", encrypted);
      this.write("authSession", null);
      this.write("authToken", null);
    } else {
      // Logout, or OS encryption unavailable: same behavior as before.
      this.write("authSessionEnc", null);
      this.write("authSession", session);
      this.write("authToken", session?.accessToken ?? null);
    }
    log.info(
      `[StorageService] auth session ${session?.accessToken ? "saved" : "cleared"}${
        encrypted ? " (encrypted)" : ""
      }`,
    );
  }

  clearAuthSession(): void {
    this.setAuthSession(null);
  }
}
