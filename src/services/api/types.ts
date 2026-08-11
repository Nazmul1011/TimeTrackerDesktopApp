/**
 * Shared API response / domain types for backend integration.
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message: string;
};

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  session_token: string;
};

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  role?: string;
  status?: string;
  isActive?: boolean;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  currency?: string;
  timezone?: string;
  isActive?: boolean;
  createdAt?: string;
};

export type OrganizationMember = {
  id: string;
  role: string;
  status: string;
  isOwner: boolean;
  departmentId?: string | null;
  jobTitle?: string | null;
};

export type OrganizationWithMembership = Organization & {
  membership: OrganizationMember;
};

export type ApiTimerStatus = "running" | "paused";

export type ApiTimer = {
  id: string;
  startTime: string;
  pausedAt?: string | null;
  elapsedSeconds: number;
  status: ApiTimerStatus;
  projectId?: string | null;
  description?: string | null;
  project?: { id: string; name: string; color?: string | null } | null;
};

export type ActivityPayload = {
  timestamp: string;
  appName: string;
  windowTitle?: string;
  duration: number;
  isIdle: boolean;
  deviceId: string;
  timeEntryId?: string;
};
