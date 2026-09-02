/**
 * Timesheet / time entries API.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";

export type ApiTimeEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  duration?: number | null;
  description?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string; color?: string | null } | null;
  source?: string;
  isManual?: boolean;
  status?: string;
};

export function toIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const timesheetApi = {
  async listToday() {
    const today = toIsoDate();
    const { data } = await apiClient.get<
      ApiResponse<{ entries: ApiTimeEntry[] }>
    >("/time-entries", {
      params: { startDate: today, endDate: today, limit: 100 },
    });
    return data.data?.entries ?? [];
  },

  /** Total saved seconds for today (completed time entries only). */
  async getTodayLoggedSeconds() {
    const entries = await this.listToday();
    return entries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
  },

  async update(
    id: string,
    payload: {
      description?: string;
      projectId?: string | null;
    },
  ) {
    const { data } = await apiClient.patch<
      ApiResponse<{ entry: ApiTimeEntry }>
    >(`/time-entries/${id}`, payload);
    return data.data?.entry;
  },

  async delete(id: string) {
    const { data } = await apiClient.delete<
      ApiResponse<{ id: string; deleted: boolean }>
    >(`/time-entries/${id}`);
    return data.data;
  },
};
