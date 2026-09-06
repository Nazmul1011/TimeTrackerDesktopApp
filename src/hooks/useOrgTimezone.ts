/**
 * IANA timezone of the active organization, reactive to org switches.
 */
"use client";

import { useAuthStore } from "@/store/auth.store";

export function useOrgTimezone(): string | null {
  const organizations = useAuthStore((s) => s.organizations);
  const organizationId = useAuthStore((s) => s.organizationId);
  return organizations.find((o) => o.id === organizationId)?.timezone ?? null;
}
