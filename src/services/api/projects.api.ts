/**
 * Projects API — list projects available for the current member.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";
import { isValidProjectId } from "@/lib/project";

export type ApiProject = {
  id: string;
  name: string;
  color?: string | null;
  status?: string;
  clientName?: string | null;
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
  if (Array.isArray(page.projects)) return page.projects;
  if (Array.isArray(page.items)) return page.items;
  if (Array.isArray(page.data)) return page.data;
  if (page.data && typeof page.data === "object") {
    const nested = page.data as PaginatedProjects;
    if (Array.isArray(nested.projects)) return nested.projects;
    if (Array.isArray(nested.items)) return nested.items;
  }
  return [];
}

export const projectsApi = {
  async listMine() {
    const params = { limit: 100 };
    const [mine, all] = await Promise.all([
      apiClient
        .get<ApiResponse<unknown>>("/projects/my", { params })
        .then(({ data }) => normalizeProjects(data.data))
        .catch(() => [] as ApiProject[]),
      apiClient
        .get<ApiResponse<unknown>>("/projects", { params })
        .then(({ data }) => normalizeProjects(data.data))
        .catch(() => [] as ApiProject[]),
    ]);
    const byId = new Map<string, ApiProject>();
    for (const project of [...mine, ...all]) {
      if (!isValidProjectId(project.id)) continue;
      byId.set(project.id, project);
    }
    return [...byId.values()];
  },

  async create(input: { name: string; code: string; clientName?: string }) {
    const { data } = await apiClient.post<ApiResponse<ApiProject>>("/projects", {
      name: input.name,
      code: input.code,
      ...(input.clientName ? { clientName: input.clientName } : {}),
    });
    const project = data.data;
    if (!project?.id || !isValidProjectId(project.id)) {
      throw new Error("Project was created but the server returned an invalid id.");
    }
    return project;
  },
};
