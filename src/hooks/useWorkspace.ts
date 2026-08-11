/**
 * Workspace hook — organization from auth store.
 */
"use client";

import { useAuthStore } from "@/store/auth.store";

export function useWorkspace() {
  const organizations = useAuthStore((s) => s.organizations);
  const organizationId = useAuthStore((s) => s.organizationId);
  const setOrganizationId = useAuthStore((s) => s.setOrganizationId);

  const organization =
    organizations.find((o) => o.id === organizationId) ?? organizations[0] ?? null;

  return {
    organization,
    organizations,
    organizationId,
    setOrganizationId,
    /** @deprecated use organization */
    workspace: organization
      ? {
          id: organization.id,
          name: organization.name,
          organizationId: organization.id,
          logoUrl: organization.logo ?? null,
        }
      : null,
  };
}
