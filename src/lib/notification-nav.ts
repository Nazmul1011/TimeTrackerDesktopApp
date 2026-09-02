/**
 * Navigate from notification actionUrl within the desktop app.
 */
import { ROUTES } from "@/constants/routes";

export type NotificationNavTarget =
  | { type: "route"; path: string; tab?: "summary" | "timesheet" | "screenshots" }
  | { type: "external"; url: string };

export function resolveNotificationAction(
  actionUrl?: string | null,
): NotificationNavTarget | null {
  if (!actionUrl?.trim()) return null;
  const raw = actionUrl.trim();

  if (/^https?:\/\//i.test(raw)) {
    return { type: "external", url: raw };
  }

  const path = raw.startsWith("/") ? raw : `/${raw}`;

  if (path.startsWith("/activity") || path.startsWith("/screenshots")) {
    return { type: "route", path: ROUTES.HOME, tab: "screenshots" };
  }
  if (path.startsWith("/leave")) {
    return { type: "route", path: ROUTES.HOME, tab: "summary" };
  }
  if (path.startsWith("/timesheet") || path.startsWith("/time")) {
    return { type: "route", path: ROUTES.HOME, tab: "timesheet" };
  }
  if (path.startsWith("/notifications")) {
    return { type: "route", path: ROUTES.NOTIFICATIONS };
  }
  if (path.startsWith("/settings")) {
    return { type: "route", path: ROUTES.SETTINGS };
  }
  if (path.startsWith("/profile")) {
    return { type: "route", path: ROUTES.PROFILE };
  }

  return { type: "route", path: ROUTES.HOME, tab: "summary" };
}

export const HOME_TAB_EVENT = "gr8r:home-tab";

export function requestHomeTab(tab: "summary" | "timesheet" | "screenshots") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HOME_TAB_EVENT, { detail: { tab } }),
  );
}
