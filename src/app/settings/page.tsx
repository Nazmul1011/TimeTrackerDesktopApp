/**
 * Settings page.
 */
"use client";

import { useRouter } from "next/navigation";
import { RiArrowLeftSLine } from "react-icons/ri";
import { SettingsForm } from "@/components/settings/settings-form";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants/routes";

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="app-shell">
      <div className="flex w-full items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => router.push(ROUTES.HOME)}
        >
          <RiArrowLeftSLine size={16} />
          Back
        </Button>
        <h1 className="text-sm text-[var(--text-subtle)]">Settings</h1>
        <div className="w-12" />
      </div>
      <SettingsForm />
    </div>
  );
}
