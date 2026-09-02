/**
 * User profile API — GET/PATCH /users/me
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone?: string | null;
  language?: string | null;
  dateFormat?: string | null;
  timeFormat?: string | null;
  jobTitle?: string | null;
  employeeId?: string | null;
  membership?: {
    jobTitle?: string | null;
    role?: string;
    department?: { id: string; name: string } | null;
  } | null;
};

export type UpdateProfilePayload = {
  name?: string;
  phone?: string;
  address?: string;
  timezone?: string;
  language?: string;
  dateFormat?: string;
  timeFormat?: "12h" | "24h";
};

export const usersApi = {
  async getMe() {
    const { data } = await apiClient.get<ApiResponse<UserProfile>>("/users/me");
    return data.data;
  },

  async updateMe(payload: UpdateProfilePayload) {
    const { data } = await apiClient.patch<ApiResponse<UserProfile>>(
      "/users/me",
      payload,
    );
    return data.data;
  },
};
