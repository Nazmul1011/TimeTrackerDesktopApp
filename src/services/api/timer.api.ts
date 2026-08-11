/**
 * Timer API — start / stop / pause / resume / sync / current.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ApiResponse, ApiTimer } from "./types";

export type StartTimerPayload = {
  projectId?: string;
  description?: string;
  deviceId?: string;
};

export type StopTimerPayload = {
  description?: string;
};

export type DeviceTimerPayload = {
  deviceId?: string;
};

export const timerApi = {
  async start(payload: StartTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>(
      "/timer/start",
      {
        ...payload,
        deviceId: payload.deviceId ?? ensureDeviceId(),
      },
    );
    return data.data.timer;
  },

  async stop(payload: StopTimerPayload = {}) {
    const { data } = await apiClient.post<
      ApiResponse<{ entries: unknown[]; count: number }>
    >("/timer/stop", payload);
    return data.data;
  },

  async pause(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>(
      "/timer/pause",
      {
        ...payload,
        deviceId: payload.deviceId ?? ensureDeviceId(),
      },
    );
    return data.data.timer;
  },

  async resume(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>(
      "/timer/resume",
      {
        ...payload,
        deviceId: payload.deviceId ?? ensureDeviceId(),
      },
    );
    return data.data.timer;
  },

  async sync(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<
      ApiResponse<{ timer: ApiTimer } | null>
    >("/timer/sync", {
      ...payload,
      deviceId: payload.deviceId ?? ensureDeviceId(),
    });
    return data.data?.timer ?? null;
  },

  async current() {
    const { data } = await apiClient.get<
      ApiResponse<{ timer: ApiTimer } | null>
    >("/timer/current");
    return data.data?.timer ?? null;
  },
};
