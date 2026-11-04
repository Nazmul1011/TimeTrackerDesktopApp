/**
 * Characterization tests for the API client's auth rules (src/services/api/client.ts):
 * - only a 401 from /auth/refresh logs the user out
 * - network errors / 5xx during refresh keep the session
 * - many 401s at once share a single refresh
 * - a missing access token with a refresh token present is not "logged out"
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

type Reply = { status: number; data?: unknown } | "network-error";
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>;

function jwt(expiresInSec: number): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expiresInSec;
  return `${encode({ alg: "HS256" })}.${encode({ exp })}.sig`;
}

const storage = new MemoryStorage();
let win = new EventTarget();
let handler: Handler;
const calls: Array<{ url: string; auth?: string }> = [];

async function adapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = `${config.baseURL ?? ""}${config.url ?? ""}`;
  calls.push({ url, auth: config.headers?.Authorization as string | undefined });
  const reply = await handler(config);
  if (reply === "network-error") {
    throw new AxiosError("Network Error", "ERR_NETWORK", config);
  }
  const response = {
    data: reply.data ?? {},
    status: reply.status,
    statusText: String(reply.status),
    headers: {},
    config,
  } as AxiosResponse;
  if (reply.status >= 400) {
    throw new AxiosError("Request failed", "ERR_BAD_RESPONSE", config, null, response);
  }
  return response;
}

async function loadClient() {
  vi.resetModules();
  const axios = (await import("axios")).default;
  axios.defaults.adapter = adapter;
  const mod = await import("@/services/api/client");
  mod.apiClient.defaults.adapter = adapter;
  return mod;
}

const refreshCalls = () => calls.filter((c) => c.url.endsWith("/auth/refresh"));

describe("API client auth rules", () => {
  let sessionInvalid: number;
  let refreshedEvents: string[];

  beforeEach(() => {
    storage.clear();
    calls.length = 0;
    sessionInvalid = 0;
    refreshedEvents = [];
    vi.stubGlobal("localStorage", storage);
    win = new EventTarget();
    vi.stubGlobal("window", win);
    win.addEventListener("auth:session-invalid", () => (sessionInvalid += 1));
    win.addEventListener("auth:token-refreshed", (e) =>
      refreshedEvents.push((e as CustomEvent<{ accessToken: string }>).detail.accessToken),
    );
    storage.setItem("authToken", jwt(600));
    storage.setItem("refreshToken", "refresh-1");
    storage.setItem("sessionToken", "sess-1");
    storage.setItem("organizationId", "org-1");
    storage.setItem("deviceId", "device-1");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches auth, org, session and device headers", async () => {
    let seen: InternalAxiosRequestConfig | undefined;
    handler = (config) => {
      seen = config;
      return { status: 200, data: { data: "ok" } };
    };
    const { apiClient } = await loadClient();
    await apiClient.get("/timer/current");

    expect(seen?.headers.Authorization).toBe(`Bearer ${storage.getItem("authToken")}`);
    expect(seen?.headers["x-organization-id"]).toBe("org-1");
    expect(seen?.headers["x-session-token"]).toBe("sess-1");
    expect(seen?.headers["x-device-id"]).toBe("device-1");
    expect(seen?.headers["x-device-type"]).toBe("desktop");
  });

  it("on 401, refreshes once and retries with the new token", async () => {
    const fresh = jwt(900);
    handler = (config) => {
      if (config.url?.endsWith("/auth/refresh")) {
        return { status: 200, data: { data: { access_token: fresh } } };
      }
      return config.headers.Authorization === `Bearer ${fresh}`
        ? { status: 200, data: { data: "ok" } }
        : { status: 401 };
    };
    const { apiClient } = await loadClient();
    const res = await apiClient.get("/timesheet");

    expect(res.data).toEqual({ data: "ok" });
    expect(refreshCalls()).toHaveLength(1);
    expect(storage.getItem("authToken")).toBe(fresh);
    expect(refreshedEvents).toEqual([fresh]);
    expect(sessionInvalid).toBe(0);
  });

  it("many 401s at the same time share a single refresh", async () => {
    const fresh = jwt(900);
    handler = async (config) => {
      if (config.url?.endsWith("/auth/refresh")) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { status: 200, data: { data: { access_token: fresh } } };
      }
      return config.headers.Authorization === `Bearer ${fresh}` ? { status: 200 } : { status: 401 };
    };
    const { apiClient } = await loadClient();
    await Promise.all([apiClient.get("/a"), apiClient.get("/b"), apiClient.get("/c")]);
    expect(refreshCalls()).toHaveLength(1);
  });

  it("keeps the session when refresh fails because the network is down", async () => {
    handler = (config) =>
      config.url?.endsWith("/auth/refresh") ? "network-error" : { status: 401 };
    const { apiClient } = await loadClient();

    await expect(apiClient.get("/timesheet")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(storage.getItem("refreshToken")).toBe("refresh-1");
    expect(storage.getItem("authToken")).not.toBeNull();
    expect(sessionInvalid).toBe(0);
  });

  it("keeps the session when the server errors (5xx) during refresh", async () => {
    handler = (config) =>
      config.url?.endsWith("/auth/refresh") ? { status: 503 } : { status: 401 };
    const { apiClient } = await loadClient();

    await expect(apiClient.get("/timesheet")).rejects.toBeTruthy();
    expect(storage.getItem("refreshToken")).toBe("refresh-1");
    expect(sessionInvalid).toBe(0);
  });

  it("logs out only when the refresh token itself is rejected (401)", async () => {
    handler = () => ({ status: 401 });
    const { apiClient } = await loadClient();

    await expect(apiClient.get("/timesheet")).rejects.toBeTruthy();
    expect(storage.getItem("authToken")).toBeNull();
    expect(storage.getItem("refreshToken")).toBeNull();
    expect(storage.getItem("sessionToken")).toBeNull();
    expect(sessionInvalid).toBe(1);
  });

  it("does not treat a 403 as a logout", async () => {
    handler = () => ({ status: 403 });
    const { apiClient } = await loadClient();
    await expect(apiClient.get("/admin")).rejects.toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
    expect(storage.getItem("refreshToken")).toBe("refresh-1");
    expect(sessionInvalid).toBe(0);
  });

  it("does not try to refresh after a failed login", async () => {
    handler = () => ({ status: 401 });
    const { apiClient } = await loadClient();
    await expect(apiClient.post("/auth/login", {})).rejects.toBeTruthy();
    expect(refreshCalls()).toHaveLength(0);
    expect(sessionInvalid).toBe(0);
  });

  it("refreshes up front when the stored token has expired (after hours in the tray)", async () => {
    storage.setItem("authToken", jwt(-60));
    const fresh = jwt(900);
    handler = (config) =>
      config.url?.endsWith("/auth/refresh")
        ? { status: 200, data: { data: { access_token: fresh } } }
        : { status: 200 };
    const { apiClient } = await loadClient();
    await apiClient.get("/timer/current");

    expect(refreshCalls()).toHaveLength(1);
    const request = calls.find((c) => c.url.endsWith("/timer/current"));
    expect(request?.auth).toBe(`Bearer ${fresh}`);
  });

  it("a missing access token with a refresh token present is not logged out", async () => {
    storage.removeItem("authToken");
    const fresh = jwt(900);
    handler = () => ({ status: 200, data: { data: { access_token: fresh } } });
    const { getFreshAccessToken } = await loadClient();

    await expect(getFreshAccessToken()).resolves.toBe(fresh);
    expect(sessionInvalid).toBe(0);
  });

  describe("online / offline state", () => {
    async function connection() {
      return (await import("@/store/connection.store")).useConnectionStore;
    }

    it("a request with no answer marks the app offline; any answer marks it online", async () => {
      let reply: Reply = "network-error";
      handler = () => reply;
      const { apiClient } = await loadClient();
      const store = await connection();

      await expect(apiClient.get("/timer/current")).rejects.toBeTruthy();
      expect(store.getState().online).toBe(false);
      expect(store.getState().offlineSince).not.toBeNull();

      reply = { status: 200, data: { data: null } };
      await apiClient.get("/timer/current");
      expect(store.getState().online).toBe(true);
      expect(store.getState().restoredAt).not.toBeNull();
    });

    it("502/503/504 from the proxy count as offline; 4xx/500 do not", async () => {
      let status = 503;
      handler = () => ({ status });
      const { apiClient } = await loadClient();
      const store = await connection();

      await expect(apiClient.get("/a")).rejects.toBeTruthy();
      expect(store.getState().online).toBe(false);

      status = 500;
      await expect(apiClient.get("/a")).rejects.toBeTruthy();
      expect(store.getState().online).toBe(true);

      status = 404;
      await expect(apiClient.get("/a")).rejects.toBeTruthy();
      expect(store.getState().online).toBe(true);
    });
  });

  it("getFreshAccessToken returns null while offline but keeps the session", async () => {
    storage.setItem("authToken", jwt(-60));
    handler = () => "network-error";
    const { getFreshAccessToken } = await loadClient();

    await expect(getFreshAccessToken()).resolves.toBeNull();
    expect(storage.getItem("refreshToken")).toBe("refresh-1");
    expect(sessionInvalid).toBe(0);
  });
});
