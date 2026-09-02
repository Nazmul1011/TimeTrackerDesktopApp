/**
 * Workspace / organization selector — uses auth store orgs.
 */
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { timerApi } from "@/services/api/timer.api";
import {
  connectRealtime,
  disconnectRealtime,
} from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export function WorkspaceSelector() {
  const organizations = useAuthStore((s) => s.organizations);
  const organizationId = useAuthStore((s) => s.organizationId);
  const setOrganizationId = useAuthStore((s) => s.setOrganizationId);
  const tokens = useAuthStore((s) => s.tokens);
  const hydrateFromApi = useTimerStore((s) => s.hydrateFromApi);

  const current =
    organizations.find((o) => o.id === organizationId) ?? organizations[0];

  const switchOrganization = async (orgId: string) => {
    if (orgId === organizationId) return;
    setOrganizationId(orgId);

    disconnectRealtime();
    if (tokens.accessToken) {
      connectRealtime({
        token: tokens.accessToken,
        organizationId: orgId,
      });
    }

    try {
      const synced = await timerApi.sync();
      hydrateFromApi(synced);
    } catch {
      try {
        const currentTimer = await timerApi.current();
        hydrateFromApi(currentTimer);
      } catch {
        hydrateFromApi(null);
      }
    }
  };

  if (!current) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-[#e6e6e6] bg-[#f5f5f5] px-2 py-1.5">
        <span className="max-w-[100px] truncate text-sm font-medium text-[#1e2939]">
          No org
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-[#e6e6e6] bg-[#f5f5f5] px-2 py-1.5 outline-none transition-colors duration-150 hover:bg-[#efefef] focus-visible:ring-2 focus-visible:ring-[#2b7fff]/35 data-[state=open]:bg-[#efefef]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.logo || "/figma/workspace-avatar.svg"}
            alt=""
            className="size-4 rounded-full object-cover"
            width={16}
            height={16}
          />
          <span className="max-w-[100px] truncate text-sm font-medium text-[#1e2939]">
            {current.name}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/figma/icon-chevron-16.svg"
            alt=""
            className="size-4 opacity-70"
            width={16}
            height={16}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => {
              void switchOrganization(org.id);
            }}
          >
            {org.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
