/**
 * App header — logo, workspace selector, notifications, overflow menu.
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceSelector } from "@/components/layout/workspace-selector";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/constants/routes";
import { authApi } from "@/services/api/auth.api";
import { disconnectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";
import { useTimerStore } from "@/store/timer.store";

export function Header() {
  const router = useRouter();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const clearSession = useAuthStore((s) => s.clearSession);
  const resetTimer = useTimerStore((s) => s.reset);

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } finally {
      disconnectRealtime();
      resetTimer();
      clearSession();
      router.push(ROUTES.LOGIN);
    }
  };

  return (
    <header className="flex w-full items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Link href={ROUTES.HOME} className="relative size-8 shrink-0 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/logo.svg" alt="Gr8r" className="size-full object-cover" width={32} height={32} />
        </Link>
        <WorkspaceSelector />
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="relative size-8 rounded-lg border-[var(--border-subtle)] bg-white shadow-none"
          onClick={() => router.push(ROUTES.NOTIFICATIONS)}
          aria-label="Notifications"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/figma/icon-bell.svg" alt="" className="size-4" width={16} height={16} />
          {unreadCount > 0 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/figma/icon-bell-dot.svg"
              alt=""
              className="absolute right-1.5 top-1.5 size-1.5"
              width={6}
              height={6}
            />
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg"
              aria-label="More"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/figma/icon-more.svg" alt="" className="size-4" width={16} height={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => router.push(ROUTES.PROFILE)}>Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(ROUTES.NOTIFICATIONS)}>
              Notifications
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleSignOut()}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
