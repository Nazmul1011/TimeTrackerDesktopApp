/**
 * Timer API — start / stop / pause / resume / sync / current.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ApiResponse, ApiTimer } from "./types";
import { isValidProjectId } from "@/lib/project";

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

export type StopTimerResult = {
  userId?: string;
  entries?: Array<{ duration?: number | null }>;
  count?: number;
  totalDurationSeconds?: number;
};

export const timerApi = {
  async start(payload: StartTimerPayload = {}) {
    const body: Record<string, string> = {
      deviceId: payload.deviceId ?? ensureDeviceId(),
    };
    if (payload.description?.trim()) {
      body.description = payload.description.trim();
    }
    if (payload.projectId && isValidProjectId(payload.projectId)) {
      body.projectId = payload.projectId.trim();
    }
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>("/timer/start", body);
    return data.data.timer;
  },

  async stop(payload: StopTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<StopTimerResult>>("/timer/stop", payload);
    return data.data ?? { entries: [], count: 0, totalDurationSeconds: 0 };
  },

  async pause(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>("/timer/pause", {
      ...payload,
      deviceId: payload.deviceId ?? ensureDeviceId(),
    });
    return data.data.timer;
  },

  async resume(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>("/timer/resume", {
      ...payload,
      deviceId: payload.deviceId ?? ensureDeviceId(),
    });
    return data.data.timer;
  },

  async sync(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer } | null>>("/timer/sync", {
      ...payload,
      deviceId: payload.deviceId ?? ensureDeviceId(),
    });
    return data.data?.timer ?? null;
  },

  async current() {
    const { data } =
      await apiClient.get<ApiResponse<{ timer: ApiTimer } | ApiTimer | null>>("/timer/current");
    const payload = data.data;
    if (!payload) return null;
    if ("timer" in payload && payload.timer) return payload.timer;
    if ("id" in payload && "startTime" in payload) return payload as ApiTimer;
    return null;
  },

  /** Discard the live session and delete today's timesheet + activity for this user. */
  async resetDay() {
    const { data } = await apiClient.post<
      ApiResponse<{
        date?: string;
        entriesDeleted?: number;
        activitiesDeleted?: number;
      }>
    >("/timer/reset-day");
    return data.data;
  },
};
