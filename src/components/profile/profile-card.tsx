/**
 * Profile card.
 */
"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ProfileCardProps {
  name?: string;
  email?: string;
  workspace?: string;
}

export function ProfileCard({
  name = "User",
  email = "user@example.com",
  workspace,
}: ProfileCardProps) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="surface-card flex w-full flex-col items-start gap-4 p-4 sm:flex-row sm:items-center">
      <Avatar className="h-16 w-16">
        <AvatarFallback className="bg-[var(--brand)] text-lg text-white">{initials}</AvatarFallback>
      </Avatar>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-[#1e2939]">{name}</p>
        <p className="text-sm text-[var(--text-subtle)]">{email}</p>
        {workspace && <p className="text-xs text-[var(--text-muted)]">{workspace}</p>}
      </div>
    </div>
  );
}
