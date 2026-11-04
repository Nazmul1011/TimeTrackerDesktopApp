/**
 * Auth session encryption at rest + migration from the old plaintext format.
 * StorageService is built without the disk store (in-memory fallback), so
 * tests never write to the user's profile; the encryption logic is the same.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const keychain = vi.hoisted(() => ({ available: true, broken: false }));

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("electron", () => ({
  app: { isReady: () => true },
  safeStorage: {
    isEncryptionAvailable: () => keychain.available,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`),
    decryptString: (buf: Buffer) => {
      const text = buf.toString();
      if (keychain.broken || !text.startsWith("enc:")) throw new Error("decrypt failed");
      return text.slice(4);
    },
  },
}));

type StorageModule = typeof import("../../electron/services/storage");
type Memory = { authSession: unknown; authSessionEnc: string | null; authToken: string | null };

const session = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  sessionToken: "sess-1",
  organizationId: "org-1",
  user: { id: "u1", name: "Test" },
  organizations: [{ id: "org-1" }],
};

async function freshService() {
  vi.resetModules();
  const mod: StorageModule = await import("../../electron/services/storage");
  type Ctor = new (
    cipher?: unknown,
    useDiskStore?: boolean,
  ) => InstanceType<StorageModule["StorageService"]>;
  const service = new (mod.StorageService as unknown as Ctor)(undefined, false);
  const memory = (service as unknown as { memory: Memory }).memory;
  return { service, memory };
}

describe("StorageService auth session", () => {
  beforeEach(() => {
    keychain.available = true;
    keychain.broken = false;
  });

  it("stores the session encrypted, with no plaintext tokens left", async () => {
    const { service, memory } = await freshService();
    service.setAuthSession(session);

    expect(memory.authSession).toBeNull();
    expect(memory.authToken).toBeNull();
    expect(memory.authSessionEnc).toBeTypeOf("string");
    expect(Buffer.from(memory.authSessionEnc!, "base64").toString()).toContain("enc:");
    expect(service.getAuthSession()).toEqual(session);
    expect(service.getAuthToken()).toBe("access-1");
  });

  it("migrates a plaintext session from an older version without logging out", async () => {
    const { service, memory } = await freshService();
    keychain.available = false;
    service.setAuthSession(session); // what the old version left on disk
    expect(memory.authSession).toEqual(session);

    keychain.available = true;
    expect(service.getAuthSession()).toEqual(session);
    expect(memory.authSession).toBeNull();
    expect(memory.authSessionEnc).toBeTypeOf("string");
    expect(service.getAuthSession()).toEqual(session);
  });

  it("keeps the old plaintext behavior when OS encryption is unavailable", async () => {
    keychain.available = false;
    const { service, memory } = await freshService();
    service.setAuthSession(session);

    expect(memory.authSessionEnc).toBeNull();
    expect(memory.authSession).toEqual(session);
    expect(memory.authToken).toBe("access-1");
    expect(service.getAuthSession()).toEqual(session);
  });

  it("logout clears both the encrypted and plaintext copies", async () => {
    const { service, memory } = await freshService();
    service.setAuthSession(session);
    service.clearAuthSession();

    expect(memory.authSessionEnc).toBeNull();
    expect(memory.authSession).toBeNull();
    expect(memory.authToken).toBeNull();
    expect(service.getAuthSession()).toBeNull();
  });

  it("returns null instead of throwing when the keychain can no longer decrypt", async () => {
    const { service } = await freshService();
    service.setAuthSession(session);
    keychain.broken = true;
    expect(service.getAuthSession()).toBeNull();
  });

  it("fills missing fields with null for older saved shapes", async () => {
    const { service } = await freshService();
    service.setAuthSession({ accessToken: "a" } as never);
    expect(service.getAuthSession()).toMatchObject({
      accessToken: "a",
      refreshToken: null,
      organizations: null,
    });
  });
});
