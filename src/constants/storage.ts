/**
 * Local storage / electron-store key constants.
 */
export const STORAGE_KEYS = {
  AUTH_TOKEN: "authToken",
  REFRESH_TOKEN: "refreshToken",
  SESSION_TOKEN: "sessionToken",
  ORGANIZATION_ID: "organizationId",
  DEVICE_ID: "deviceId",
  SETTINGS: "settings",
  THEME: "theme",
  /** @deprecated use ORGANIZATION_ID */
  WORKSPACE_ID: "workspaceId",
} as const;
