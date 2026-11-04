/**
 * Timer API — start / stop / pause / resume / sync / current.
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ApiResponse, ApiTimer } from "./types";
import { isValidProjectId } from "@/lib/project";
import { getUserTimezone } from "@/lib/org-date";

/** Give up quickly so a dead server cannot hold Start or Stop. */
const QUICK_TIMEOUT_MS = 4_000;
const quick = { timeout: QUICK_TIMEOUT_MS };

export type StartTimerPayload = {
  projectId?: string;
  description?: string;
  deviceId?: string;
  occurredAt?: string;
};

export type StopTimerPayload = {
  description?: string;
  occurredAt?: string;
};

export type DeviceTimerPayload = {
  deviceId?: string;
  /**
   * When the pause/resume really happened (ISO-8601). The server uses it
   * instead of its own arrival time, so a delayed or replayed request still
   * lands at the right moment.
   */
  occurredAt?: string;
};

export type ReplayTimerEvent = {
  kind: "start" | "pause" | "resume" | "stop";
  occurredAt: string;
  projectId?: string;
  description?: string;
  synthetic?: boolean;
};

export type ReplayTimerResult = {
  applied: number;
  open: boolean;
  reopened: boolean;
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
    if (payload.occurredAt) body.occurredAt = payload.occurredAt;
    if (payload.description?.trim()) {
      body.description = payload.description.trim();
    }
    if (payload.projectId && isValidProjectId(payload.projectId)) {
      body.projectId = payload.projectId.trim();
    }
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>(
      "/timer/start",
      body,
      quick,
    );
    return data.data.timer;
  },

  async stop(payload: StopTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<StopTimerResult>>(
      "/timer/stop",
      payload,
      quick,
    );
    return data.data ?? { entries: [], count: 0, totalDurationSeconds: 0 };
  },

  async pause(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer }>>(
      "/timer/pause",
      {
        ...payload,
        deviceId: payload.deviceId ?? ensureDeviceId(),
      },
      quick,
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
      quick,
    );
    return data.data.timer;
  },

  async sync(payload: DeviceTimerPayload = {}) {
    const { data } = await apiClient.post<ApiResponse<{ timer: ApiTimer } | null>>("/timer/sync", {
      ...payload,
      deviceId: payload.deviceId ?? ensureDeviceId(),
    });
    return data.data?.timer ?? null;
  },

  async replay(body: {
    sessionStartedAt: string;
    complete: boolean;
    deviceId?: string;
    events: ReplayTimerEvent[];
  }) {
    const { data } = await apiClient.post<ApiResponse<ReplayTimerResult>>(
      "/timer/replay",
      {
        ...body,
        deviceId: body.deviceId ?? ensureDeviceId(),
      },
      quick,
    );
    return data.data;
  },

  async current() {
    const { data } = await apiClient.get<ApiResponse<{ timer: ApiTimer } | ApiTimer | null>>(
      "/timer/current",
      quick,
    );
    const payload = data.data;
    if (!payload) return null;
    if ("timer" in payload && payload.timer) return payload.timer;
    if ("id" in payload && "startTime" in payload) return payload as ApiTimer;
    return null;
  },

  /** Discard the live session and delete today's timesheet + activity for this user. */
  async resetDay(timezone?: string) {
    const { data } = await apiClient.post<
      ApiResponse<{
        date?: string;
        entriesDeleted?: number;
        activitiesDeleted?: number;
      }>
    >("/timer/reset-day", {
      timezone: timezone ?? getUserTimezone(),
    });
    return data.data;
  },

  /** Split the live session at midnight, saving yesterday and advancing start time to 00:00:00. */
  async midnightSplit(occurredAt?: string, timezone?: string) {
    const { data } = await apiClient.post<
      ApiResponse<{
        split: boolean;
        yesterdayEntry?: unknown;
        runningTimer?: ApiTimer;
      }>
    >("/timer/midnight-split", {
      occurredAt,
      timezone: timezone ?? getUserTimezone(),
    });
    return data.data;
  },
};
