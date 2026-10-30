/**
 * Local storage / electron-store key constants.
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: "authToken",
  REFRESH_TOKEN: "refreshToken",
  SESSION_TOKEN: "sessionToken",
  ORGANIZATION_ID: "organizationId",
  AUTH_USER: "authUser",
  AUTH_ORGANIZATIONS: "authOrganizations",
  DEVICE_ID: "deviceId",
  SETTINGS: "settings",
  THEME: "theme",
  /** @deprecated use ORGANIZATION_ID */
  WORKSPACE_ID: "workspaceId",
} as const;

export const AUTH_EVENTS = {
  TOKEN_REFRESHED: "auth:token-refreshed",
  SESSION_INVALID: "auth:session-invalid",
} as const;
