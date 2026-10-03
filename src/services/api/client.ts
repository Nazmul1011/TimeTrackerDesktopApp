/**
 * Axios API client.
 * Attaches auth/org/device headers and refreshes access token on 401.
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { STORAGE_KEYS } from "@/constants/storage";
import type { ApiResponse, AuthTokens } from "./types";

const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

export const apiClient = axios.create({
  baseURL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
  },
});

function getDeviceId(): string {
  if (typeof window === "undefined") return "desktop-ssr";
  let deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `desktop-${Date.now()}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  }
  return deviceId;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined" && config.headers) {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    const orgId = localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID);
    const sessionToken = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (orgId) {
      config.headers["x-organization-id"] = orgId;
    }
    if (sessionToken) {
      config.headers["x-session-token"] = sessionToken;
    }
    config.headers["x-device-id"] = getDeviceId();
    config.headers["x-device-type"] = "desktop";

    // Let the browser set multipart boundary for FormData uploads
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      config.headers.delete("Content-Type");
    }
  }
  return config;
});

/**
 * "invalid": the server rejected the refresh token (login really ended).
 * "unavailable": no answer (offline, server restarting, 5xx) — the login may
 * still be fine, so the session must be kept.
 */
type RefreshResult =
  { status: "ok"; accessToken: string } | { status: "invalid" } | { status: "unavailable" };

let refreshPromise: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  if (typeof window === "undefined") return { status: "unavailable" };

  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return { status: "invalid" };

  try {
    const response = await axios.post<ApiResponse<Pick<AuthTokens, "access_token">>>(
      `${baseURL}/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } },
    );
    const newAccessToken = response.data.data.access_token;
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, newAccessToken);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auth:token-refreshed", {
          detail: { accessToken: newAccessToken },
        }),
      );
    }
    return { status: "ok", accessToken: newAccessToken };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 401 || status === 403) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
      return { status: "invalid" };
    }
    return { status: "unavailable" };
  }
}

function refreshOnce(): Promise<RefreshResult> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function accessTokenExpiresSoon(token: string, skewMs = 30_000): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: number;
    };
    return typeof payload.exp !== "number" || payload.exp * 1000 - Date.now() < skewMs;
  } catch {
    return true;
  }
}

/**
 * A usable access token, refreshing first when the stored one is missing or
 * about to expire. The realtime socket calls this on every (re)connect so it
 * never presents a stale token. Returns null when signed out or unreachable.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const current = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  if (current && !accessTokenExpiresSoon(current)) return current;
  const result = await refreshOnce();
  return result.status === "ok" ? result.accessToken : null;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url?.includes("/auth/refresh") ||
      originalRequest.url?.includes("/auth/login")
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const refreshed = await refreshOnce();

    if (refreshed.status === "unavailable") {
      // Keep the session; the caller sees the original error and can retry.
      return Promise.reject(error);
    }

    if (refreshed.status === "invalid") {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
    return apiClient(originalRequest);
  },
);

export function getApiBaseUrl() {
  return baseURL;
}

export function ensureDeviceId(): string {
  return getDeviceId();
}

export default apiClient;
