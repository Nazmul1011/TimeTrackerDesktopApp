/**
 * Monitoring config API.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";

export type MonitoringConfig = {
  activityMonitoringEnabled?: boolean;
  screenshotEnabled?: boolean;
  /** Minutes between screenshots */
  screenshotInterval?: number;
  screenshotQuality?: number;
  blurSensitiveScreenshots?: boolean;
  [key: string]: unknown;
};

export const monitoringApi = {
  async getConfig() {
    const { data } = await apiClient.get<ApiResponse<MonitoringConfig>>(
      "/monitoring/config",
    );
    return data.data;
  },
};
