/**
 * Notifications API — list / unread / mark read.
 */
import { apiClient } from "./client";
import type { ApiResponse } from "./types";
import type { AppNotification, NotificationKind } from "@/types";

export type ApiNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  actionText?: string | null;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  sender?: { id: string; name: string; email: string };
};

export type NotificationsListResult = {
  notifications: ApiNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
};

export function kindFromApiNotification(
  type: string,
  title: string,
  message: string,
): NotificationKind {
  if (type.startsWith("LEAVE_")) return "leave";
  const text = `${title} ${message}`.toLowerCase();
  if (
    text.includes("screenshot") ||
    text.includes("delete request") ||
    text.includes("deletion")
  ) {
    return "screenshot";
  }
  return "info";
}

export function mapApiNotification(n: ApiNotification): AppNotification {
  return {
    id: n.id,
    title: n.title,
    body: n.message,
    type:
      n.type === "LEAVE_APPROVED" || n.type === "PAYROLL_PROCESSED"
        ? "success"
        : n.type === "LEAVE_REJECTED" || n.type === "OVERTIME_ALERT"
          ? "warning"
          : n.type === "SYSTEM_ALERT"
            ? "error"
            : "info",
    kind: kindFromApiNotification(n.type, n.title, n.message),
    backendType: n.type,
    read: n.isRead,
    createdAt:
      typeof n.createdAt === "string"
        ? n.createdAt
        : new Date(n.createdAt).toISOString(),
    actionUrl: n.actionUrl ?? null,
  };
}

export const notificationsApi = {
  async list(params?: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const { data } = await apiClient.get<ApiResponse<NotificationsListResult>>(
      "/notifications",
      { params: { limit: 30, ...params } },
    );
    return data.data;
  },

  async getUnreadCount() {
    const { data } = await apiClient.get<ApiResponse<{ count: number }>>(
      "/notifications/unread-count",
    );
    return data.data.count;
  },

  async markAsRead(id: string) {
    const { data } = await apiClient.patch<ApiResponse<ApiNotification>>(
      `/notifications/${id}/read`,
    );
    return mapApiNotification(data.data);
  },

  async markAllAsRead() {
    const { data } = await apiClient.post<ApiResponse<{ updatedCount: number }>>(
      "/notifications/read-all",
    );
    return data.data;
  },

  async delete(id: string) {
    await apiClient.delete(`/notifications/${id}`);
  },
};
