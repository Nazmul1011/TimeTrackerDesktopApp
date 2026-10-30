/**
 * Screenshot upload + list API.
 */
import { getOrgTimezone, todayInZone } from "@/lib/org-date";
import { apiClient, ensureDeviceId, getApiBaseUrl } from "./client";
import type { ApiResponse } from "./types";

export type ScreenshotUploadMeta = {
  timestamp: string;
  appName: string;
  windowTitle?: string;
  deviceId?: string;
};

export type ApiScreenshot = {
  id: string;
  imageUrl?: string | null;
  url?: string | null;
  capturedAt: string;
  appName?: string | null;
  windowTitle?: string | null;
  isBlurred?: boolean;
  activityPercent?: number | null;
  deleteRequested?: boolean;
};

/** Make relative /uploads/... URLs absolute against the API host. */
export function resolveScreenshotUrl(url?: string | null): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = getApiBaseUrl().replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export const screenshotApi = {
  async upload(file: Blob | File, meta: ScreenshotUploadMeta) {
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : "screenshot.png");
    form.append("timestamp", meta.timestamp);
    form.append("appName", meta.appName);
    if (meta.windowTitle) {
      form.append("windowTitle", meta.windowTitle);
    }
    form.append("deviceId", meta.deviceId ?? ensureDeviceId());

    const { data } = await apiClient.post<
      ApiResponse<{
        id: string;
        url: string;
        capturedAt: string;
        appName: string;
      }>
    >("/screenshots/upload", form);
    return {
      ...data.data,
      url: resolveScreenshotUrl(data.data.url) ?? data.data.url,
    };
  },

  /**
   * One page of today's screenshots, newest first.
   * @param timeZone org IANA zone; defaults to the active org's.
   */
  async listToday(page = 1, limit = 10, timeZone?: string | null) {
    // The org's calendar day, not the device's — see lib/org-date.
    const today = todayInZone(timeZone ?? getOrgTimezone());
    const { data } = await apiClient.get<
      ApiResponse<{
        data?: ApiScreenshot[];
        screenshots?: ApiScreenshot[];
        items?: ApiScreenshot[];
        meta?: { total?: number; totalPages?: number };
      }>
    >("/screenshots", {
      params: {
        startDate: today,
        endDate: today,
        page,
        limit,
      },
    });

    const payload = data.data;
    const rows = payload?.data ?? payload?.screenshots ?? payload?.items ?? [];
    const total = payload?.meta?.total ?? rows.length;
    return {
      items: rows.map((item) => ({
        ...item,
        imageUrl: resolveScreenshotUrl(item.imageUrl ?? item.url) ?? item.imageUrl ?? null,
      })),
      total,
      totalPages: payload?.meta?.totalPages ?? Math.max(1, Math.ceil(total / limit)),
    };
  },

  async requestDeletion(id: string) {
    const { data } = await apiClient.post<
      ApiResponse<{
        id: string;
        deleteRequested: boolean;
        alreadyRequested?: boolean;
        timeLabel?: string;
      }>
    >(`/screenshots/${id}/delete-request`);
    return data.data;
  },

  async listPendingDeletionRequests(limit = 50) {
    const { data } = await apiClient.get<
      ApiResponse<
        Array<{
          id: string;
          capturedAt: string;
          appName?: string | null;
          imageUrl?: string | null;
          url?: string | null;
          user?: { id: string; name: string; email: string };
        }>
      >
    >("/screenshots/deletion-requests/pending", { params: { limit } });
    const items = Array.isArray(data.data) ? data.data : [];
    return items.map((item) => ({
      ...item,
      imageUrl: resolveScreenshotUrl(item.imageUrl ?? item.url) ?? item.imageUrl ?? null,
    }));
  },

  async reviewDeletion(id: string, action: "approve" | "reject", comment?: string) {
    const { data } = await apiClient.post<ApiResponse<{ id: string; action: string }>>(
      `/screenshots/${id}/review-deletion`,
      { action, comment },
    );
    return data.data;
  },
};
