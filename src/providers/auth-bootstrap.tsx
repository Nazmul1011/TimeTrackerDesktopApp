/**
 * Restores the desktop session after launch / renderer reload.
 * Hydrates tokens from localStorage, refreshes JWT if needed, then reloads profile.
 */
"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AUTH_EVENTS } from "@/constants/storage";
import { ROUTES } from "@/constants/routes";
import { isAccessTokenExpiring } from "@/lib/jwt";
import { authApi } from "@/services/api/auth.api";
import { refreshAccessToken } from "@/services/api/client";
import { orgApi } from "@/services/api/org.api";
import { connectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { mapApiUserToUser } from "@/types";

function connectIfPossible() {
  const { tokens, organizationId } = useAuthStore.getState();
  if (!tokens.accessToken || !organizationId) return;
  connectRealtime({
    token: tokens.accessToken,
    organizationId,
  });
}

async function restoreSession() {
  const store = useAuthStore.getState();
  const { tokens } = store;
  if (!tokens.accessToken && !tokens.refreshToken) return;

  if (isAccessTokenExpiring(tokens.accessToken) && tokens.refreshToken) {
    const next = await refreshAccessToken();
    if (next) {
      useAuthStore.getState().setSession({ accessToken: next });
    }
  }

  try {
    const [me, organizations] = await Promise.all([authApi.me(), orgApi.listMine()]);

    const current = useAuthStore.getState();
    const orgId =
      current.organizationId && organizations.some((org) => org.id === current.organizationId)
        ? current.organizationId
        : (organizations[0]?.id ?? null);

    current.setSession({
      user: mapApiUserToUser(me),
      organizations,
      organizationId: orgId,
    });
    connectIfPossible();
  } catch {
    // Keep the persisted session on network / backend errors.
    connectIfPossible();
  }
}

export function AuthBootstrap() {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hasHydrated) return;
    void restoreSession();
  }, [hasHydrated]);

  useEffect(() => {
    const onRefreshed = (event: Event) => {
      const accessToken = (event as CustomEvent<{ accessToken?: string }>).detail?.accessToken;
      if (accessToken) setSession({ accessToken });
    };

    const onInvalid = () => {
      clearSession();
      if (pathname !== ROUTES.LOGIN) {
        router.replace(ROUTES.LOGIN);
      }
    };

    window.addEventListener(AUTH_EVENTS.TOKEN_REFRESHED, onRefreshed);
    window.addEventListener(AUTH_EVENTS.SESSION_INVALID, onInvalid);
    return () => {
      window.removeEventListener(AUTH_EVENTS.TOKEN_REFRESHED, onRefreshed);
      window.removeEventListener(AUTH_EVENTS.SESSION_INVALID, onInvalid);
    };
  }, [clearSession, pathname, router, setSession]);

  return null;
}
