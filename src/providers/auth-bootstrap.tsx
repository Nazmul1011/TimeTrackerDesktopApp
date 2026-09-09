/**
 * Restore the persisted Electron session before any page decides to show login.
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { STORAGE_KEYS } from "@/constants/storage";
import { isNetworkError } from "@/lib/network";
import { authApi } from "@/services/api/auth.api";
import { loadPersistedAuthSession } from "@/services/electron/auth-session";
import { isElectron } from "@/services/electron";
import { useAuthStore } from "@/store/auth.store";

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const sessionHydrated = useAuthStore((s) => s.sessionHydrated);
  const setSession = useAuthStore((s) => s.setSession);
  const markSessionHydrated = useAuthStore((s) => s.markSessionHydrated);
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        if (isElectron()) {
          const persisted = await loadPersistedAuthSession();
          if (cancelled) return;

          if (persisted) {
            if (persisted.deviceId) {
              localStorage.setItem(STORAGE_KEYS.DEVICE_ID, persisted.deviceId);
            }
            setSession({
              accessToken: persisted.accessToken,
              refreshToken: persisted.refreshToken,
              sessionToken: persisted.sessionToken,
              organizationId: persisted.organizationId,
              deviceId: persisted.deviceId,
            });

            if (persisted.refreshToken) {
              try {
                const refreshed = await authApi.refresh(persisted.refreshToken);
                if (cancelled) return;
                setSession({ accessToken: refreshed.access_token });
              } catch (error) {
                // Stay signed in when the network is down so offline tracking works.
                if (!isNetworkError(error) && !cancelled) {
                  clearSession();
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn("[auth] failed to restore persisted session", error);
      } finally {
        if (!cancelled) markSessionHydrated();
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [clearSession, markSessionHydrated, setSession]);

  if (!sessionHydrated) {
    return <div className="min-h-screen bg-[#f9fafb]" />;
  }

  return children;
}
