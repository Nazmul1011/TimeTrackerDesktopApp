/**
 * Notification dropdown menu — Figma App / Screenshots (17655:23528).
 */
"use client";

import { FigmaGlyph } from "@/components/icons/figma-glyph";
import { cn } from "@/lib/utils";
import type { AppNotification, NotificationKind } from "@/types";

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

export function NotificationMenuItem({
  notification,
  onSelect,
}: {
  notification: AppNotification;
  onSelect?: (notification: AppNotification) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-md px-1 py-1 text-left outline-none hover:bg-[#fafafa] focus-visible:bg-[#f5f5f5]"
      onClick={() => onSelect?.(notification)}
    >
      <span className="flex shrink-0 items-center py-1">
        <span className="flex size-6 items-center justify-center overflow-hidden rounded-md bg-[#ebebeb]">
          <FigmaGlyph src={iconForKind(notification.kind)} size={16} />
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm leading-5 text-[#1e2939]">{notification.title}</span>
        <span className="text-xs leading-4 text-[#4a5565]">{notification.body}</span>
      </span>
    </button>
  );
}

export function NotificationDropdownList({
  notifications,
  onSelect,
  className,
}: {
  notifications: AppNotification[];
  onSelect?: (notification: AppNotification) => void;
  className?: string;
}) {
  if (notifications.length === 0) {
    return (
      <div className={cn("px-3 py-6 text-center text-xs text-[#99a1af]", className)}>
        No notifications
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col", className)}>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="border-b border-[#ededed] px-2 pb-1 pt-2 last:border-b-0"
        >
          <NotificationMenuItem notification={notification} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
