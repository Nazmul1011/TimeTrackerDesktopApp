/**
 * Navigate from notification actionUrl within the desktop app.
 */
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  requestHomeTab,
  resolveNotificationAction,
} from "@/lib/notification-nav";

export function useNotificationNavigation() {
  const router = useRouter();

  const navigateFromNotification = useCallback(
    (actionUrl?: string | null) => {
      const target = resolveNotificationAction(actionUrl);
      if (!target) return;

      if (target.type === "external") {
        window.open(target.url, "_blank", "noopener,noreferrer");
        return;
      }

      if (target.tab) {
        requestHomeTab(target.tab);
      }

      router.push(target.path);
    },
    [router],
  );

  return { navigateFromNotification };
}
