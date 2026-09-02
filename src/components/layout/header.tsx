/**
 * App header — Figma App / Summary + live notifications menu (17655:23528).
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WorkspaceSelector } from "@/components/layout/workspace-selector";
import { NotificationDropdownList } from "@/components/notification/notification-dropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/constants/routes";
import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { authApi } from "@/services/api/auth.api";
import { disconnectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

const headerIconClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg p-2 outline-none transition-colors duration-150 hover:bg-[#f5f5f5] focus-visible:ring-2 focus-visible:ring-[#2b7fff]/35 active:bg-[#efefef]";

export function Header() {
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);
  const resetTimer = useTimerStore((s) => s.reset);
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    loadNotifications,
    markAsRead,
  } = useNotifications({ poll: true });
  const { navigateFromNotification } = useNotificationNavigation();

  useEffect(() => {
    void loadNotifications({ silent: true });
  }, [loadNotifications]);

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
        <Link
          href={ROUTES.HOME}
          className="relative size-8 shrink-0 overflow-hidden rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[#2b7fff]/35"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/figma/logo.svg"
            alt="Gr8r"
            className="size-full object-cover"
            width={32}
            height={32}
          />
        </Link>
        <WorkspaceSelector />
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) void loadNotifications();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                headerIconClass,
                "cursor-pointer border border-[#ededed] bg-white hover:border-[#e6e6e6] data-[state=open]:bg-[#f5f5f5]",
              )}
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  unreadCount > 0
                    ? "/figma/icon-bell-unread.svg"
                    : "/figma/icon-bell.svg"
                }
                alt=""
                className="size-4 object-contain"
                width={16}
                height={16}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-[281px] min-w-[281px] max-h-[360px] overflow-y-auto overflow-x-hidden rounded-xl border border-[#e6e6e6] bg-white p-0 shadow-[0_1px_1px_rgba(0,0,0,0.03),0_4px_2px_rgba(0,0,0,0.03),0_9px_2.5px_rgba(0,0,0,0.02)]"
          >
            {isLoading && notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-[#99a1af]">
                Loading…
              </div>
            ) : error && notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-6">
                <p className="text-center text-xs text-[#99a1af]">{error}</p>
                <button
                  type="button"
                  className="text-xs font-medium text-[#2b7fff]"
                  onClick={() => void loadNotifications()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <NotificationDropdownList
                  notifications={notifications}
                  onSelect={(n) => {
                    if (!n.read) void markAsRead(n.id);
                    navigateFromNotification(n.actionUrl);
                  }}
                />
                <div className="border-t border-[#ededed] px-3 py-2">
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-[#2b7fff]"
                    onClick={() => router.push(ROUTES.NOTIFICATIONS)}
                  >
                    View all notifications
                  </button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                headerIconClass,
                "cursor-pointer bg-transparent data-[state=open]:bg-[#f5f5f5]",
              )}
              aria-label="More"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/figma/icon-more.svg"
                alt=""
                className="size-4 object-contain"
                width={16}
                height={16}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 rounded-lg border-[#ededed]"
          >
            <DropdownMenuItem onClick={() => router.push(ROUTES.PROFILE)}>
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(ROUTES.SETTINGS)}>
              Settings
            </DropdownMenuItem>
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
