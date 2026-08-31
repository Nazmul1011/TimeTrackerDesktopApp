/**
 * Activity API — bulk ingest, heartbeat, and app usage analytics.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ActivityPayload, ApiResponse } from "./types";

export type ActivityAppRow = {
  appName: string;
  totalDuration: number;
  /** Share of tracked app time in the queried range (0–100). */
  percent: number;
  breakdown: {
    productive: number;
    unproductive: number;
    neutral: number;
    idle: number;
  };
};

export const activityApi = {
  async bulk(activities: ActivityPayload[]) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      "/activity/bulk",
      { activities },
    );
    return data.data;
  },

  async heartbeat(payload?: { deviceId?: string; version?: string }) {
    const { data } = await apiClient.post<ApiResponse<unknown>>(
      "/activity/heartbeat",
      {
        deviceId: payload?.deviceId ?? ensureDeviceId(),
        version: payload?.version ?? "0.1.0",
      },
    );
    return data.data;
  },

  async getApps(params?: {
    startDate?: string;
    endDate?: string;
    excludeIdle?: boolean;
  }) {
    const { data } = await apiClient.get<ApiResponse<ActivityAppRow[]>>(
      "/activity/apps",
      { params },
    );
    return data.data ?? [];
  },
};
