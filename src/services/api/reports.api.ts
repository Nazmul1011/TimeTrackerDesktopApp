/**
 * Reports API — personal dashboard summary.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";

export type ReportSummary = {
  period: { startDate: string; endDate: string; workingDays: number };
  expectedHours: number;
  totalLoggedHours: number;
  overtimeHours: number;
  leaveDays: number;
  activeUsers: number;
  productivityScore: number;
};

export const reportsApi = {
  async getSummary(params: { startDate: string; endDate: string }) {
    const { data } = await apiClient.get<ApiResponse<ReportSummary>>(
      "/reports/summary",
      { params },
    );
    return data.data;
  },
};
