/**
 * Notifications page — settings toggles + live inbox from backend.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ROUTES } from "@/constants/routes";
import { useNotifications } from "@/hooks/useNotifications";
import { useSettingsStore } from "@/store/settings.store";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function NotificationsPage() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const {
    notifications,
    isLoading,
    error,
    loadNotifications,
    markAsRead,
  } = useNotifications({ poll: true });

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  return (
    <div className="app-shell">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-sm text-[var(--text-subtle)]">Notifications</h1>
        <Button
          variant="outline"
          size="icon"
          className="size-8 rounded-lg border-[var(--border-subtle)]"
          onClick={() => router.push(ROUTES.HOME)}
          aria-label="Close"
        >
          <span className="text-base leading-none">×</span>
        </Button>
      </div>

      <div className="surface-card w-full overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
          <div>
            <p className="text-xs text-[#1e2939]">Push Notifications</p>
            <p className="text-xs text-[var(--text-muted)]">Timer reminders & alerts</p>
          </div>
          <Switch
            checked={settings.notificationsEnabled}
            onCheckedChange={(checked) => setSettings({ notificationsEnabled: checked })}
          />
        </div>
        <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
          <div>
            <p className="text-xs text-[#1e2939]">Idle Detection</p>
            <p className="text-xs text-[var(--text-muted)]">Alert after 3 min idle</p>
          </div>
          <Switch
            checked={settings.idleTimeoutMinutes > 0}
            onCheckedChange={(checked) =>
              setSettings({ idleTimeoutMinutes: checked ? 3 : 0 })
            }
          />
        </div>

        <div className="px-4 py-3">
          <p className="mb-2 text-xs font-medium text-[#1e2939]">Inbox</p>
          <ScrollArea className="h-[220px]">
            {isLoading && notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">Loading…</p>
            ) : error && notifications.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">{error}</p>
                <button
                  type="button"
                  className="mt-2 text-xs text-[var(--brand)]"
                  onClick={() => void loadNotifications()}
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--text-muted)]">No notifications</p>
            ) : (
              <ul className="space-y-3">
                {notifications.map((n) => (
                  <li key={n.id} className="rounded-lg bg-[var(--surface-elevated)] p-3">
                    <p className="text-xs font-medium text-[#1e2939]">{n.title}</p>
                    <p className="mt-1 text-xs leading-4 text-[var(--text-subtle)]">{n.body}</p>
                    {!n.read && (
                      <button
                        type="button"
                        className="mt-2 text-[11px] text-[var(--brand)]"
                        onClick={() => void markAsRead(n.id)}
                      >
                        Mark as read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
