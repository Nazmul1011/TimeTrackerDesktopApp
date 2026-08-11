/**
 * Settings form — working switches persisted in Zustand.
 */
"use client";

import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettingsStore } from "@/store/settings.store";
import { toast } from "sonner";

export function SettingsForm() {
  const settings = useSettingsStore((s) => s.settings);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const { setTheme } = useTheme();

  return (
    <div className="surface-card w-full space-y-5 p-4">
      <div>
        <h2 className="text-sm font-medium text-[#1e2939]">Preferences</h2>
        <p className="text-xs text-[var(--text-muted)]">Desktop client settings</p>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="notifications" className="text-xs">
          Enable notifications
        </Label>
        <Switch
          id="notifications"
          checked={settings.notificationsEnabled}
          onCheckedChange={(checked) => {
            setSettings({ notificationsEnabled: checked });
            toast.success(checked ? "Notifications on" : "Notifications off");
          }}
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <Label htmlFor="auto-start" className="text-xs">
          Launch on login
        </Label>
        <Switch
          id="auto-start"
          checked={settings.autoStartOnLogin}
          onCheckedChange={(checked) => setSettings({ autoStartOnLogin: checked })}
        />
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs">Screenshot interval</Label>
          <p className="text-[11px] text-[var(--text-muted)]">Minutes between captures</p>
        </div>
        <Select
          value={String(settings.screenshotIntervalMinutes)}
          onValueChange={(v) => setSettings({ screenshotIntervalMinutes: Number(v) })}
        >
          <SelectTrigger className="h-8 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 15, 30].map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m}m
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <Label className="text-xs">Theme</Label>
        <Select
          value={settings.theme}
          onValueChange={(v: "light" | "dark" | "system") => {
            setSettings({ theme: v });
            setTheme(v);
          }}
        >
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
