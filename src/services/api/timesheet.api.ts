/**
 * Timesheet / time entries API.
 */
import { getOrgTimezone, todayInZone } from "@/lib/org-date";
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

export const timesheetApi = {
  /** @param timeZone org IANA zone; defaults to the active org's. */
  async listToday(timeZone?: string | null) {
    // The org's calendar day, not the device's — see lib/org-date.
    const today = todayInZone(timeZone ?? getOrgTimezone());
    const { data } = await apiClient.get<ApiResponse<{ entries: ApiTimeEntry[] }>>(
      "/time-entries",
      {
        params: { startDate: today, endDate: today, limit: 100 },
      },
    );
    return data.data?.entries ?? [];
  },

  /** List entries within a date range (inclusive). */
  async listRange(startDate: string, endDate: string) {
    let page = 1;
    const allEntries: ApiTimeEntry[] = [];
    while (page <= 5) {
      const { data } = await apiClient.get<
        ApiResponse<{
          entries: ApiTimeEntry[];
          pagination?: { hasNext?: boolean };
        }>
      >("/time-entries", {
        params: { startDate, endDate, limit: 200, page },
      });
      const list = data.data?.entries ?? [];
      allEntries.push(...list);
      if (!data.data?.pagination?.hasNext || list.length === 0) break;
      page++;
    }
    return allEntries;
  },

  /** Total saved seconds for today (completed time entries only). */
  async getTodayLoggedSeconds(timeZone?: string | null) {
    const entries = await this.listToday(timeZone);
    return entries.reduce((sum, entry) => sum + (entry.duration ?? 0), 0);
  },

  async update(
    id: string,
    payload: {
      description?: string;
      projectId?: string | null;
    },
  ) {
    const { data } = await apiClient.patch<ApiResponse<{ entry: ApiTimeEntry }>>(
      `/time-entries/${id}`,
      payload,
    );
    return data.data?.entry;
  },

  async delete(id: string) {
    const { data } = await apiClient.delete<ApiResponse<{ id: string; deleted: boolean }>>(
      `/time-entries/${id}`,
    );
    return data.data;
  },
};
