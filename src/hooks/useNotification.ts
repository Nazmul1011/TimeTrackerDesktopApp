/**
 * Notification hook — scaffolding.
 */
"use client";

import { useNotificationStore } from "@/store/notification.store";

export function useNotification() {
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const setNotifications = useNotificationStore((s) => s.setNotifications);

  return {
    notifications,
    unreadCount,
    setNotifications,
  };
}
