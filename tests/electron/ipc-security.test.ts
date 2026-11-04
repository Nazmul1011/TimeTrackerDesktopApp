/**
 * IPC payload schemas, sender guard, and external URL allow-list.
 * Payload fixtures mirror what the renderer sends today (useTrackingAgent,
 * auth.store, api client, notify, window-reveal), so a schema change that
 * would reject real traffic fails here first.
 */
import { describe, expect, it, vi } from "vitest";

const ipc = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
}));

vi.mock("electron-log/main", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
      ipc.handlers.set(channel, listener);
    },
  },
}));

import {
  authSessionSchema,
  idleResumeReasonSchema,
  notificationSchema,
  nullToUndefined,
  parseIpcPayload,
  revealSchema,
  trackingAuthSchema,
  trackingStartSchema,
} from "../../electron/security/ipc-schemas";
import {
  installIpcSenderGuard,
  isTrustedSenderUrl,
} from "../../electron/security/ipc-sender-guard";
import { isSafeExternalUrl } from "../../electron/security/external-url";
import { ipcMain } from "electron";

const API = "http://localhost:3001";

describe("IPC payload schemas accept real renderer traffic", () => {
  it("tracking:start from useTrackingAgent", () => {
    const payload = {
      accessToken: "jwt",
      refreshToken: null,
      organizationId: "org-1",
      deviceId: "3f1c-uuid",
      sessionToken: null,
      apiBaseUrl: "https://gr8rtrackerapp.gr8rdesign.com",
      screenshotIntervalMs: 300_000,
      enableScreenshots: true,
      firstScreenshotDelayMs: 3_000,
      idleTimeoutMs: 120_000,
    };
    expect(parseIpcPayload("tracking:start", trackingStartSchema, payload)).toEqual(payload);
  });

  it("tracking:start with idle turned off (idleTimeoutMs 0)", () => {
    const payload = { accessToken: "jwt", organizationId: "o", apiBaseUrl: API, idleTimeoutMs: 0 };
    expect(parseIpcPayload("tracking:start", trackingStartSchema, payload)).toEqual(payload);
  });

  it("tracking:updateAuth with organizationId undefined", () => {
    const payload = {
      accessToken: "jwt",
      refreshToken: "r",
      organizationId: undefined,
      apiBaseUrl: API,
    };
    expect(parseIpcPayload("tracking:updateAuth", trackingAuthSchema, payload)).not.toBeNull();
  });

  it("auth:saveSession from auth.store and the api client", () => {
    const payload = {
      accessToken: "a",
      refreshToken: "r",
      sessionToken: null,
      organizationId: null,
      user: { id: "u", email: "x@y.z", nested: { any: [1, 2] } },
      organizations: null,
    };
    expect(parseIpcPayload("auth:saveSession", authSessionSchema, payload)).toEqual(payload);
  });

  it("notification:show and window reveal payloads", () => {
    expect(
      parseIpcPayload("n", notificationSchema, { title: "Timer paused", body: "Idle" }),
    ).toEqual({
      title: "Timer paused",
      body: "Idle",
    });
    expect(parseIpcPayload("w", revealSchema, { delayMs: 300_000 })).toEqual({ delayMs: 300_000 });
    expect(revealSchema.safeParse(undefined).success).toBe(true);
    expect(revealSchema.safeParse(null).success).toBe(true);
  });

  it("idle auto-resume reason: a short string, or nothing (older callers)", () => {
    expect(parseIpcPayload("r", idleResumeReasonSchema, "manual pause")).toBe("manual pause");
    expect(idleResumeReasonSchema.safeParse(undefined).success).toBe(true);
    expect(idleResumeReasonSchema.safeParse(null).success).toBe(true);
    expect(idleResumeReasonSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(idleResumeReasonSchema.safeParse({ reason: "x" }).success).toBe(false);
  });
});

describe("IPC payload schemas reject bad input", () => {
  it("rejects an API URL that is not http(s)", () => {
    for (const apiBaseUrl of ["file:///C:/evil", "javascript:alert(1)", "ftp://x", "not a url"]) {
      expect(trackingAuthSchema.safeParse({ accessToken: "a", apiBaseUrl }).success).toBe(false);
    }
  });

  it("rejects wrong types and oversized values", () => {
    expect(trackingStartSchema.safeParse({ screenshotIntervalMs: "300000" }).success).toBe(false);
    expect(trackingStartSchema.safeParse({ idleTimeoutMs: -1 }).success).toBe(false);
    expect(authSessionSchema.safeParse({ accessToken: "x".repeat(20_000) }).success).toBe(false);
    expect(authSessionSchema.safeParse("a string").success).toBe(false);
    expect(revealSchema.safeParse({ delayMs: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("nullToUndefined drops nulls only", () => {
    expect(nullToUndefined({ a: null, b: "x", c: undefined, d: 0 })).toEqual({ b: "x", d: 0 });
  });
});

describe("isTrustedSenderUrl", () => {
  const origin = "http://127.0.0.1:51234";

  it("trusts the renderer origin and loopback dev/prod servers", () => {
    expect(isTrustedSenderUrl("http://127.0.0.1:51234/home/", origin)).toBe(true);
    expect(isTrustedSenderUrl("http://localhost:3000/home", origin)).toBe(true);
    expect(isTrustedSenderUrl("http://127.0.0.1:9999/", origin)).toBe(true);
  });

  it("allows a frame that has no URL yet", () => {
    expect(isTrustedSenderUrl("", origin)).toBe(true);
    expect(isTrustedSenderUrl(undefined, origin)).toBe(true);
  });

  it("rejects remote sites and non-http schemes", () => {
    expect(isTrustedSenderUrl("https://evil.example/", origin)).toBe(false);
    expect(isTrustedSenderUrl("file:///C:/page.html", origin)).toBe(false);
    expect(isTrustedSenderUrl("data:text/html,hi", origin)).toBe(false);
  });
});

describe("installIpcSenderGuard", () => {
  it("runs handlers for trusted senders and throws for untrusted ones", async () => {
    installIpcSenderGuard(() => "http://localhost:3000");
    ipcMain.handle("test:ping", async (_e, value) => `pong:${String(value)}`);

    const wrapped = ipc.handlers.get("test:ping")!;
    await expect(wrapped({ senderFrame: { url: "http://localhost:3000/home" } }, 1)).resolves.toBe(
      "pong:1",
    );
    expect(() => wrapped({ senderFrame: { url: "https://evil.example" } }, 1)).toThrow(
      "Untrusted IPC sender",
    );
  });
});

describe("isSafeExternalUrl", () => {
  it("allows web and mail links", () => {
    expect(isSafeExternalUrl("https://gr8r.com")).toBe(true);
    expect(isSafeExternalUrl("http://example.com/a?b=c")).toBe(true);
    expect(isSafeExternalUrl("mailto:support@gr8r.com")).toBe(true);
  });

  it("blocks schemes that can launch local programs", () => {
    for (const url of [
      "file:///C:/Windows/System32/calc.exe",
      "ms-msdt:/id",
      "smb://host/share",
      "javascript:alert(1)",
      "garbage",
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});
