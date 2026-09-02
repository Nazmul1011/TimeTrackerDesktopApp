/**
 * Notifications hook — loads from backend, polls badge + optional inbox list.
 */
"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  mapApiNotification,
  notificationsApi,
} from "@/services/api/notifications.api";
import { notifyOs } from "@/lib/notify";
import { useAuthStore } from "@/store/auth.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

export const NOTIFICATIONS_CHANGED_EVENT = "gr8r:notifications-changed";

const POLL_MS = 45_000;
const LIST_POLL_MS = 30_000;

function getErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { message?: string } } })
      .response;
    if (response?.data?.message) return response.data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useNotifications(options?: {
  poll?: boolean;
  /** Also refresh the full inbox list on an interval (notifications page). */
  pollList?: boolean;
}) {
  const poll = options?.poll ?? true;
  const pollList = options?.pollList ?? false;
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
  const knownIdsRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const count = await notificationsApi.getUnreadCount();
      setUnreadCount(count);
    } catch {
      // keep badge quiet on poll failures
    }
  }, [enabled, setUnreadCount]);

  const loadNotifications = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!enabled) return;
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await notificationsApi.list({ limit: 40 });
        const mapped = result.notifications.map(mapApiNotification);

        const previousIds = knownIdsRef.current;
        const nextIds = new Set(mapped.map((n) => n.id));
        if (primedRef.current) {
          const freshUnread = mapped.filter(
            (n) => !previousIds.has(n.id) && !n.read,
          );
          if (
            freshUnread.length > 0 &&
            useSettingsStore.getState().settings.notificationsEnabled
          ) {
            for (const n of freshUnread.slice(0, 3)) {
              void notifyOs(n.title, n.body);
            }
          }
        } else {
          primedRef.current = true;
        }
        knownIdsRef.current = nextIds;

        setNotifications(mapped, result.unreadCount);
      } catch (err) {
        if (!opts?.silent) {
          setError(getErrorMessage(err, "Failed to load notifications"));
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [enabled, setError, setLoading, setNotifications],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      markAsReadLocal(id);
      try {
        await notificationsApi.markAsRead(id);
      } catch {
        await loadNotifications({ silent: true });
      }
    },
    [loadNotifications, markAsReadLocal],
  );

  const markAllAsRead = useCallback(async () => {
    markAllAsReadLocal();
    try {
      await notificationsApi.markAllAsRead();
    } catch {
      await loadNotifications({ silent: true });
    }
  }, [loadNotifications, markAllAsReadLocal]);

  const deleteNotification = useCallback(
    async (id: string) => {
      removeLocal(id);
      try {
        await notificationsApi.delete(id);
      } catch {
        await loadNotifications({ silent: true });
      }
    },
    [loadNotifications, removeLocal],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      primedRef.current = false;
      knownIdsRef.current = new Set();
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

  useEffect(() => {
    if (!enabled || !pollList) return;
    const id = window.setInterval(() => {
      void loadNotifications({ silent: true });
    }, LIST_POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, pollList, loadNotifications]);

  useEffect(() => {
    if (!enabled) return;
    const onChanged = () => {
      void loadNotifications({ silent: true });
      void refreshUnreadCount();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () =>
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [enabled, loadNotifications, refreshUnreadCount]);

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

/** Notify listeners (header badge / inbox) that the backend inbox changed. */
export function emitNotificationsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
