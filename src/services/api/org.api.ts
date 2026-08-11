/**
 * Organization API.
 */
import { apiClient } from "./client";
import type { ApiResponse, OrganizationWithMembership } from "./types";

export const orgApi = {
  async listMine() {
    const { data } = await apiClient.get<
      ApiResponse<{ organizations: OrganizationWithMembership[] }>
    >("/organizations");
    return data.data.organizations;
  },
};
