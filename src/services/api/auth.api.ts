/**
 * Auth API — login, refresh, me, logout.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ApiResponse, ApiUser, AuthTokens } from "./types";

export type LoginPayload = {
  email: string;
  password: string;
};

export const authApi = {
  async login(payload: LoginPayload) {
    ensureDeviceId();
    const { data } = await apiClient.post<ApiResponse<AuthTokens>>(
      "/auth/login",
      payload,
    );
    return data.data;
  },

  async refresh(refreshToken: string) {
    const { data } = await apiClient.post<
      ApiResponse<Pick<AuthTokens, "access_token">>
    >("/auth/refresh", { refreshToken });
    return data.data;
  },

  async me() {
    const { data } = await apiClient.get<ApiResponse<ApiUser>>("/auth/me");
    return data.data;
  },

  async logout() {
    try {
      await apiClient.post<ApiResponse<null>>("/auth/logout");
    } catch {
      // ignore — local session still cleared by caller
    }
  },
};
