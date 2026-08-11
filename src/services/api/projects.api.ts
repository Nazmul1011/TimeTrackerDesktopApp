/**
 * Projects API — list projects available for the current member.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";

export type ApiProject = {
  id: string;
  name: string;
  color?: string | null;
  status?: string;
};

type PaginatedProjects = {
  items?: ApiProject[];
  data?: ApiProject[];
  projects?: ApiProject[];
};

function normalizeProjects(payload: unknown): ApiProject[] {
  if (Array.isArray(payload)) return payload as ApiProject[];
  if (!payload || typeof payload !== "object") return [];
  const page = payload as PaginatedProjects;
  if (Array.isArray(page.items)) return page.items;
  if (Array.isArray(page.data)) return page.data;
  if (Array.isArray(page.projects)) return page.projects;
  return [];
}

export const projectsApi = {
  async listMine() {
    try {
      const { data } = await apiClient.get<ApiResponse<unknown>>("/projects/my");
      return normalizeProjects(data.data);
    } catch {
      const { data } = await apiClient.get<ApiResponse<unknown>>("/projects");
      return normalizeProjects(data.data);
    }
  },
};
