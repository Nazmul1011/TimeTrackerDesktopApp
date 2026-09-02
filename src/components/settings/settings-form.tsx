/**
 * Settings form — notifications, launch on login, org screenshot interval.
 * Theme switching is not available yet (Coming soon).
 */
"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { monitoringApi } from "@/services/api/monitoring.api";
import { useSettingsStore } from "@/store/settings.store";
import { toast } from "sonner";

export function SettingsForm() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [orgIntervalMinutes, setOrgIntervalMinutes] = useState<number | null>(
    null,
  );
  const [orgScreenshotsEnabled, setOrgScreenshotsEnabled] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void monitoringApi
      .getConfig()
      .then((cfg) => {
        if (cancelled) return;
        const minutes = Number(cfg?.screenshotInterval);
        const resolved =
          Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
        setOrgIntervalMinutes(resolved);
        setOrgScreenshotsEnabled(cfg?.screenshotEnabled !== false);
        void setSettings({ screenshotIntervalMinutes: resolved });
      })
      .catch(() => {
        if (!cancelled) setOrgIntervalMinutes(5);
      });
    return () => {
      cancelled = true;
    };
  }, [setSettings]);

  const update = async (
    key: string,
    partial: Parameters<typeof setSettings>[0],
    successMessage: string,
  ) => {
    setBusy(key);
    const result = await setSettings(partial);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.message || "Could not save setting");
      return;
    }
    toast.success(successMessage);
  };

  return (
    <div className="surface-card w-full space-y-5 p-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">Preferences</h2>
        <p className="text-xs text-[var(--text-muted)]">Desktop client settings</p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="notifications" className="text-xs">
            Enable notifications
          </Label>
          <p className="text-[11px] text-[var(--text-muted)]">
            OS alerts for timer, idle, and screenshot events
          </p>
        </div>
        <Switch
          id="notifications"
          disabled={busy === "notifications"}
          checked={settings.notificationsEnabled}
          onCheckedChange={(checked) => {
            void update(
              "notifications",
              { notificationsEnabled: checked },
              checked ? "Notifications on" : "Notifications off",
            );
          }}
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="auto-start" className="text-xs">
            Launch on login
          </Label>
          <p className="text-[11px] text-[var(--text-muted)]">
            Open Gr8r when you sign in to this computer
          </p>
        </div>
        <Switch
          id="auto-start"
          disabled={busy === "auto-start"}
          checked={settings.autoStartOnLogin}
          onCheckedChange={(checked) => {
            void update(
              "auto-start",
              { autoStartOnLogin: checked },
              checked ? "Launch on login enabled" : "Launch on login disabled",
            );
          }}
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-xs">Screenshot interval</Label>
          <p className="text-[11px] text-[var(--text-muted)]">
            Set by your organization admin
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">
          {!orgScreenshotsEnabled
            ? "Off"
            : orgIntervalMinutes
              ? `Every ${orgIntervalMinutes} min`
              : "…"}
        </span>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label className="text-xs">Theme</Label>
          <p className="text-[11px] text-[var(--text-muted)]">
            Light / dark switching
          </p>
        </div>
        <span className="shrink-0 text-xs text-[var(--text-muted)]">
          Coming soon
        </span>
      </div>
    </div>
  );
}
