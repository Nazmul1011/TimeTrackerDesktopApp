/**
 * Notification Zustand store — synced with backend /notifications.
 */
import { create } from "zustand";
import type { AppNotification } from "@/types";

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  setNotifications: (
    notifications: AppNotification[],
    unreadCount?: number,
  ) => void;
  setUnreadCount: (count: number) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  markAsReadLocal: (id: string) => void;
  markAllAsReadLocal: () => void;
  removeLocal: (id: string) => void;
  reset: () => void;
}

function unreadOf(notifications: AppNotification[]) {
  return notifications.filter((n) => !n.read).length;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,

  setNotifications: (notifications, unreadCount) =>
    set({
      notifications,
      unreadCount:
        typeof unreadCount === "number" ? unreadCount : unreadOf(notifications),
      error: null,
    }),

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  markAsReadLocal: (id) =>
    set((state) => {
      const wasUnread = state.notifications.some((n) => n.id === id && !n.read);
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      );
      return {
        notifications,
        unreadCount: wasUnread
          ? Math.max(0, state.unreadCount - 1)
          : state.unreadCount,
      };
    }),

  markAllAsReadLocal: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  removeLocal: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount:
          target && !target.read
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
      };
    }),

  reset: () =>
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
    }),
}));
