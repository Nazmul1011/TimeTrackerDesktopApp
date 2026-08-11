/**
 * Profile page.
 */
"use client";

import { useRouter } from "next/navigation";
import { ProfileCard } from "@/components/profile/profile-card";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";
import { useAuthStore } from "@/store/auth.store";

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const organizations = useAuthStore((s) => s.organizations);
  const organizationId = useAuthStore((s) => s.organizationId);
  const organization =
    organizations.find((o) => o.id === organizationId) ?? organizations[0];

  return (
    <div className="app-shell">
      <div className="flex w-full items-center justify-between">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => router.push(ROUTES.HOME)}>
          ← Back
        </Button>
        <h1 className="text-sm text-[var(--text-subtle)]">Profile</h1>
        <div className="w-12" />
      </div>
      <ProfileCard
        name={user ? `${user.firstName} ${user.lastName}`.trim() : "User"}
        email={user?.email ?? ""}
        workspace={organization?.name ?? ""}
      />
    </div>
  );
}
