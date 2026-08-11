/**
 * Shared domain types for the desktop renderer.
 * Keep these aligned with the backend API contracts as they evolve.
 */

export interface User {
  id: string;
  email: string;
  /** Full display name from backend */
  name: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role?: string;
}

export interface Workspace {
  id: string;
  name: string;
  organizationId: string;
  logoUrl?: string | null;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  color?: string;
  isActive: boolean;
}

export type TimerStatus = "idle" | "running" | "paused";

export interface Timer {
  id: string | null;
  status: TimerStatus;
  projectId: string | null;
  taskId: string | null;
  description: string;
  startedAt: string | null;
  elapsedMs: number;
}

export interface Activity {
  id: string;
  timerId: string;
  activeMs: number;
  idleMs: number;
  recordedAt: string;
}

export interface Screenshot {
  id: string;
  timerId: string;
  thumbnailUrl: string;
  capturedAt: string;
  activityPercent?: number;
}

export type NotificationType = "info" | "warning" | "success" | "error";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  screenshotIntervalMinutes: number;
  idleTimeoutMinutes: number;
  autoStartOnLogin: boolean;
  notificationsEnabled: boolean;
}

/** Split backend `name` into first/last for UI that expects both. */
export function mapApiUserToUser(apiUser: {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  role?: string;
}): User {
  const parts = (apiUser.name || "").trim().split(/\s+/);
  const firstName = parts[0] || apiUser.email.split("@")[0] || "User";
  const lastName = parts.slice(1).join(" ");
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name || `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    avatarUrl: apiUser.avatar ?? null,
    role: apiUser.role,
  };
}
