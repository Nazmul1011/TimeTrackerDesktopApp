/**
 * Screenshot upload API (multipart).
 */
import { apiClient, ensureDeviceId } from "./client";
import type { ApiResponse } from "./types";

export type ScreenshotUploadMeta = {
  timestamp: string;
  appName: string;
  windowTitle?: string;
  deviceId?: string;
};

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

    const { data } = await apiClient.post<ApiResponse<unknown>>(
      "/screenshots/upload",
      form,
    );
    return data.data;
  },
};
