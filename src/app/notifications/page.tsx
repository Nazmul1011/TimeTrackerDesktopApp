/**
 * Notifications page — push/idle preferences + live inbox from backend.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/constants/routes";
import { useNotifications } from "@/hooks/useNotifications";
import { dayjs } from "@/lib/dayjs";
import {
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  formatIdleTimeoutLabel,
  useSettingsStore,
} from "@/store/settings.store";
import { ScreenshotDeletionReview } from "@/components/screenshots/screenshot-deletion-review";
import type { AppNotification, NotificationKind } from "@/types";
import { cn } from "@/lib/utils";

function iconForKind(kind?: NotificationKind): string {
  switch (kind) {
    case "leave":
      return "/figma/icon-notif-leave.svg";
    case "screenshot":
      return "/figma/icon-notif-screenshot.svg";
    default:
      return "/figma/icon-bell.svg";
  }
}

function InboxItem({
  notification,
  onMarkRead,
  onDismiss,
  onOpen,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onOpen: (notification: AppNotification) => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border border-[var(--border-subtle)] p-3",
        notification.read ? "bg-white" : "bg-[var(--surface-elevated)]",
      )}
    >
      <button type="button" className="w-full text-left" onClick={() => onOpen(notification)}>
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#ebebeb]">
            <FigmaGlyph src={iconForKind(notification.kind)} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-[#1e2939]">{notification.title}</p>
              <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                {dayjs(notification.createdAt).fromNow()}
              </span>
            </div>
            <p className="mt-1 text-xs leading-4 text-[var(--text-subtle)]">{notification.body}</p>
          </div>
        </div>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-3 pl-11">
        {!notification.read ? (
          <button
            type="button"
            className="text-[11px] font-medium text-[var(--brand)]"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMarkRead(notification.id);
            }}
          >
            Mark as read
          </button>
        ) : (
          <span className="text-[11px] text-[var(--text-muted)]">Read</span>
        )}
        <button
          type="button"
          className="text-[11px] text-[var(--text-muted)] hover:text-[#1e2939]"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDismiss(notification.id);
          }}
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications({ poll: true, pollList: true });

  // Stay on this page — only update read state, do not route to Home.
  const handleOpenNotification = (notification: AppNotification) => {
    if (!notification.read) void markAsRead(notification.id);
  };

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  // Also refresh when returning to this page / after delete requests
  useEffect(() => {
    const onFocus = () => {
      void loadNotifications({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadNotifications]);

  const toggleSetting = async (
    key: string,
    partial: Parameters<typeof setSettings>[0],
    success: string,
  ) => {
    setBusy(key);
    const result = await setSettings(partial);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message || "Could not save preference");
      return;
    }
    toast.success(success);
  };

  return (
    <div className="app-shell">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-sm text-[var(--text-subtle)]">Notifications</h1>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg border-[var(--border-subtle)]"
          onClick={() => router.push(ROUTES.HOME)}
          aria-label="Close"
        >
          <span className="text-base leading-none">×</span>
        </Button>
      </div>

      <div className="surface-card w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
          <div>
            <p className="text-xs text-[#1e2939]">Push Notifications</p>
            <p className="text-xs text-[var(--text-muted)]">Timer reminders & alerts</p>
          </div>
          <Switch
            checked={settings.notificationsEnabled}
            disabled={busy === "push"}
            onCheckedChange={(checked) => {
              void toggleSetting(
                "push",
                { notificationsEnabled: checked },
                checked ? "Push notifications on" : "Push notifications off",
              );
            }}
          />
        </div>

        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
          <div>
            <p className="text-xs text-[#1e2939]">Idle Detection</p>
            <p className="text-xs text-[var(--text-muted)]">
              {settings.idleTimeoutMinutes > 0
                ? `Auto-pause after ${formatIdleTimeoutLabel(settings.idleTimeoutMinutes)} idle`
                : "Auto-pause when idle is off"}
            </p>
          </div>
          <Switch
            checked={settings.idleTimeoutMinutes > 0}
            disabled={busy === "idle"}
            onCheckedChange={(checked) => {
              void toggleSetting(
                "idle",
                {
                  idleTimeoutMinutes: checked ? DEFAULT_IDLE_TIMEOUT_MINUTES : 0,
                },
                checked ? "Idle detection on (2 min)" : "Idle detection off",
              );
            }}
          />
        </div>

        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-[#1e2939]">
              Inbox
              {unreadCount > 0 ? (
                <span className="ml-1.5 text-[var(--text-muted)]">({unreadCount} unread)</span>
              ) : null}
            </p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-[11px] font-medium text-[var(--brand)]"
                onClick={() => void markAllAsRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="scrollbar-hide h-[280px] overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
            ) : error && notifications.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">{error}</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--brand)]"
                  onClick={() => void loadNotifications()}
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                No notifications yet. Alerts from leave, payroll, and screenshot requests appear
                here.
              </p>
            ) : (
              <ul className="space-y-2">
                {notifications.map((n) => (
                  <InboxItem
                    key={n.id}
                    notification={n}
                    onMarkRead={(id) => void markAsRead(id)}
                    onDismiss={(id) => void deleteNotification(id)}
                    onOpen={handleOpenNotification}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ScreenshotDeletionReview />
    </div>
  );
}
