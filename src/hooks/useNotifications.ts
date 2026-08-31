/**
 * Notifications hook — loads from backend, polls unread badge.
 */
"use client";

import { useCallback, useEffect } from "react";
import {
  mapApiNotification,
  notificationsApi,
} from "@/services/api/notifications.api";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";

const POLL_MS = 45_000;

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useNotifications(options?: { poll?: boolean }) {
  const poll = options?.poll ?? true;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const organizationId = useAuthStore((s) => s.organizationId);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const isLoading = useNotificationStore((s) => s.isLoading);
  const error = useNotificationStore((s) => s.error);
  const setNotifications = useNotificationStore((s) => s.setNotifications);
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);
  const setLoading = useNotificationStore((s) => s.setLoading);
  const setError = useNotificationStore((s) => s.setError);
  const markAsReadLocal = useNotificationStore((s) => s.markAsReadLocal);
  const markAllAsReadLocal = useNotificationStore((s) => s.markAllAsReadLocal);
  const removeLocal = useNotificationStore((s) => s.removeLocal);
  const reset = useNotificationStore((s) => s.reset);

  const enabled = Boolean(isAuthenticated && organizationId);

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // keep badge quiet on poll failures
    }
  }, [enabled, setUnreadCount]);

  const loadNotifications = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await notificationsApi.list({ limit: 40 });
      setNotifications(
        result.notifications.map(mapApiNotification),
        result.unreadCount,
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load notifications"));
    } finally {
      setLoading(false);
    }
  }, [enabled, setError, setLoading, setNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      markAsReadLocal(id);
      try {
        await notificationsApi.markAsRead(id);
      } catch {
        await loadNotifications();
      }
    },
    [loadNotifications, markAsReadLocal],
  );

  const markAllAsRead = useCallback(async () => {
    markAllAsReadLocal();
    try {
      await notificationsApi.markAllAsRead();
    } catch {
      await loadNotifications();
    }
  }, [loadNotifications, markAllAsReadLocal]);

  const deleteNotification = useCallback(
    async (id: string) => {
      removeLocal(id);
      try {
        await notificationsApi.delete(id);
      } catch {
        await loadNotifications();
      }
    },
    [loadNotifications, removeLocal],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }
    void refreshUnreadCount();
  }, [enabled, refreshUnreadCount, reset]);

  useEffect(() => {
    if (!enabled || !poll) return;
    const id = window.setInterval(() => {
      void refreshUnreadCount();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, poll, refreshUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    loadNotifications,
    refreshUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
}

/** @deprecated Prefer useNotifications */
export function useNotification() {
  return useNotifications({ poll: true });
}
