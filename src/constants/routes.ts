/**
 * Application route constants.
 */
export const ROUTES = {
  ROOT: "/",
  HOME: "/home",
  LOGIN: "/login",
  PROFILE: "/profile",
  SETTINGS: "/settings",
  NOTIFICATIONS: "/notifications",
} as const;

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];
