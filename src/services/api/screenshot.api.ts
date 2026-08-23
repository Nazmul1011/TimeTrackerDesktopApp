/**
 * Screenshot upload + list API.
 */
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
};

function toIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
    form.append(
      "file",
      file,
      file instanceof File ? file.name : "screenshot.png",
    );
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

  async listToday(limit = 40) {
    const today = toIsoDate();
    const { data } = await apiClient.get<
      ApiResponse<{
        data: ApiScreenshot[];
        meta?: { total: number };
      }>
    >("/screenshots", {
      params: {
        startDate: today,
        endDate: today,
        page: 1,
        limit,
      },
    });

    const items = data.data?.data ?? [];
    return items.map((item) => ({
      ...item,
      imageUrl:
        resolveScreenshotUrl(item.imageUrl ?? item.url) ??
        item.imageUrl ??
        null,
    }));
  },
};
