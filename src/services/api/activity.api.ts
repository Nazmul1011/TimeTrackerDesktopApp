/**
 * Activity API — bulk ingest + heartbeat.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ActivityPayload, ApiResponse } from "./types";

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
};
