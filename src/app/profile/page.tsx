/**
 * Profile page — view and edit user profile via /users/me.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RiArrowLeftSLine } from "react-icons/ri";
import { ProfileCard } from "@/components/profile/profile-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/constants/routes";
import { usersApi, type UserProfile } from "@/services/api/users.api";
import { useAuthStore } from "@/store/auth.store";
import { mapApiUserToUser } from "@/types";
import { SavedCopyNote } from "@/components/layout/saved-copy-note";
import { ProfileSkeleton } from "@/components/layout/section-skeletons";
import { isOfflineError } from "@/lib/offline-error";
import { readCachedView, writeCachedView } from "@/lib/view-cache";
import { CONNECTION_RESTORED_EVENT, useConnectionStore } from "@/store/connection.store";

const PROFILE_CACHE = "profile";

export default function ProfilePage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const organizationId = useAuthStore((s) => s.organizationId);
  const organizations = useAuthStore((s) => s.organizations);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const online = useConnectionStore((s) => s.online);

  const organization = organizations.find((o) => o.id === organizationId) ?? organizations[0];

  const fill = useCallback((me: UserProfile) => {
    setProfile(me);
    setName(me.name ?? "");
    setPhone(me.phone ?? "");
    setTimezone(me.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await usersApi.getMe();
      writeCachedView(PROFILE_CACHE, "-", me);
      setSavedAt(null);
      fill(me);
    } catch (err) {
      // Offline: the profile as last loaded.
      const saved = isOfflineError(err) ? readCachedView<UserProfile>(PROFILE_CACHE, "-") : null;
      if (saved) {
        fill(saved.data);
        setSavedAt(saved.savedAt);
      } else if (!isOfflineError(err)) {
        toast.error("Could not load profile");
      }
    } finally {
      setLoading(false);
    }
  }, [fill]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRestored = () => void load();
    window.addEventListener(CONNECTION_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(CONNECTION_RESTORED_EVENT, onRestored);
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await usersApi.updateMe({
        name: name.trim(),
        phone: phone.trim() || undefined,
        timezone: timezone.trim() || undefined,
      });
      setProfile(updated);
      writeCachedView(PROFILE_CACHE, "-", updated);
      setSession({ user: mapApiUserToUser(updated) });
      toast.success("Profile updated");
    } catch {
      toast.error("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="flex w-full items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => router.push(ROUTES.HOME)}
        >
          <RiArrowLeftSLine size={16} />
          Back
        </Button>
        <h1 className="text-sm text-[var(--text-subtle)]">Profile</h1>
        <div className="w-12" />
      </div>

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <>
          <SavedCopyNote savedAt={savedAt} />
          <ProfileCard
            name={profile?.name ?? name}
            email={profile?.email ?? ""}
            workspace={organization?.name ?? ""}
            jobTitle={profile?.membership?.jobTitle ?? profile?.jobTitle ?? undefined}
          />

          <div className="surface-card w-full space-y-4 p-4">
            <p className="text-sm font-medium text-[#1e2939] dark:text-[#f1f5f9]">Edit profile</p>

            <div className="space-y-1">
              <Label className="text-xs">Full name</Label>
              <input
                className="h-9 w-full rounded-lg border border-[#e6e6e6] px-3 text-xs text-[#1e2939] outline-none focus:border-[#2b7fff] dark:border-[#334155] dark:text-[#f1f5f9]"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <input
                className="h-9 w-full rounded-lg border border-[#e6e6e6] px-3 text-xs text-[#1e2939] outline-none focus:border-[#2b7fff] dark:border-[#334155] dark:text-[#f1f5f9]"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Timezone</Label>
              <input
                className="h-9 w-full rounded-lg border border-[#e6e6e6] px-3 text-xs text-[#1e2939] outline-none focus:border-[#2b7fff] dark:border-[#334155] dark:text-[#f1f5f9]"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>

            <Button
              size="sm"
              className="w-full"
              disabled={saving || !name.trim() || !online}
              onClick={() => void handleSave()}
            >
              {saving
                ? "Saving…"
                : online
                  ? "Save changes"
                  : "Save is available when you're online"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
