/**
 * Axios API client.
 * Attaches auth/org/device headers and refreshes access token on 401.
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { AUTH_EVENTS, STORAGE_KEYS } from "@/constants/storage";
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

function isAuthFailureStatus(status: number | undefined): boolean {
  // Only a rejected refresh token should wipe login. 403 can be permission noise.
  return status === 401;
}

function emitSessionInvalid() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_INVALID));
}

function emitTokenRefreshed(accessToken: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_EVENTS.TOKEN_REFRESHED, {
      detail: { accessToken },
    }),
  );
}

function persistAccessToken(accessToken: string) {
  localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, accessToken);
  emitTokenRefreshed(accessToken);
  // Keep durable Electron session in sync when only the access JWT rotates.
  if (typeof window !== "undefined" && window.electronAPI?.auth?.saveSession) {
    void window.electronAPI.auth.saveSession({
      accessToken,
      refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
      sessionToken: localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN),
      organizationId: localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID),
      user: (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })(),
      organizations: (() => {
        try {
          const raw = localStorage.getItem(STORAGE_KEYS.AUTH_ORGANIZATIONS);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })(),
    });
  }
}

function clearPersistedTokens() {
  localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
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

let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return null;

  try {
    const response = await axios.post<ApiResponse<Pick<AuthTokens, "access_token">>>(
      `${baseURL}/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } },
    );
    const newAccessToken = response.data.data.access_token;
    if (!newAccessToken) return null;
    persistAccessToken(newAccessToken);
    return newAccessToken;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    // Only wipe the session when the refresh token itself is rejected.
    // Network / backend-down must not log the user out.
    if (isAuthFailureStatus(status)) {
      clearPersistedTokens();
      emitSessionInvalid();
    }
    return null;
  }
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

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }

    const newAccessToken = await refreshPromise;

    if (!newAccessToken) {
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
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
