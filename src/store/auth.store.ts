/**
 * Auth Zustand store — session, orgs, tokens, device.
 * Tokens persist in localStorage and also in Electron main-process store
 * so Quit/reopen keeps the user signed in (packaged builds used to lose
 * localStorage when the renderer port changed every launch).
 */
import { create } from "zustand";
import { STORAGE_KEYS } from "@/constants/storage";
import { ensureDeviceId } from "@/services/api/client";
import type { OrganizationWithMembership } from "@/services/api/types";
import { getElectronAPI, isElectron } from "@/services/electron";
import type { User } from "@/types";

export type AuthTokensState = {
  accessToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null;
};

interface AuthState {
  user: User | null;
  organizations: OrganizationWithMembership[];
  organizationId: string | null;
  tokens: AuthTokensState;
  deviceId: string | null;
  isAuthenticated: boolean;
  /** False until localStorage / Electron store has been read on the client. */
  hasHydrated: boolean;
  hydrate: () => void;
  setSession: (payload: {
    user?: User | null;
    organizations?: OrganizationWithMembership[];
    organizationId?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    sessionToken?: string | null;
  }) => void;
  setOrganizationId: (organizationId: string | null) => void;
  setOrganizations: (organizations: OrganizationWithMembership[]) => void;
  clearSession: () => void;
}

const emptyTokens: AuthTokensState = {
  accessToken: null,
  refreshToken: null,
  sessionToken: null,
};

function readDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

function readTokens(): AuthTokensState {
  if (typeof window === "undefined") return { ...emptyTokens };
  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
    refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    sessionToken: localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN),
  };
}

function readOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID);
}

function readUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (parsed && typeof parsed.id === "string" && typeof parsed.email === "string") {
      return parsed;
    }
  } catch {
    // ignore corrupt cache
  }
  return null;
}

function readOrganizations(): OrganizationWithMembership[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_ORGANIZATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OrganizationWithMembership[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((org) => org && typeof org.id === "string");
  } catch {
    return [];
  }
}

function writeOptional(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

function writeJson(key: string, value: unknown | null) {
  if (typeof window === "undefined") return;
  if (value == null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

function hasSessionTokens(tokens: AuthTokensState): boolean {
  return Boolean(tokens.accessToken || tokens.refreshToken);
}

function isUser(value: unknown): value is User {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as User).id === "string" &&
    typeof (value as User).email === "string",
  );
}

function persistToElectron(state: {
  tokens: AuthTokensState;
  organizationId: string | null;
  user: User | null;
  organizations: OrganizationWithMembership[];
}) {
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.auth?.saveSession) return;
  void api.auth.saveSession({
    accessToken: state.tokens.accessToken,
    refreshToken: state.tokens.refreshToken,
    sessionToken: state.tokens.sessionToken,
    organizationId: state.organizationId,
    user: state.user,
    organizations: state.organizations.length ? state.organizations : null,
  });
}

function clearElectronSession() {
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.auth?.logout) return;
  void api.auth.logout();
}

async function readElectronSession(): Promise<{
  tokens: AuthTokensState;
  organizationId: string | null;
  user: User | null;
  organizations: OrganizationWithMembership[];
} | null> {
  if (!isElectron()) return null;
  const api = getElectronAPI();
  if (!api?.auth?.getSession) return null;
  try {
    const session = await api.auth.getSession();
    if (!session) return null;
    if (!session.accessToken && !session.refreshToken) return null;
    const organizations = Array.isArray(session.organizations)
      ? (session.organizations as OrganizationWithMembership[]).filter(
          (org) => org && typeof org.id === "string",
        )
      : [];
    return {
      tokens: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionToken: session.sessionToken,
      },
      organizationId: session.organizationId,
      user: isUser(session.user) ? session.user : null,
      organizations,
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organizations: [],
  organizationId: null,
  tokens: { ...emptyTokens },
  deviceId: null,
  isAuthenticated: false,
  hasHydrated: false,

  hydrate: () => {
    if (typeof window === "undefined") return;

    const apply = (payload: {
      tokens: AuthTokensState;
      organizationId: string | null;
      user: User | null;
      organizations: OrganizationWithMembership[];
    }) => {
      writeOptional(STORAGE_KEYS.AUTH_TOKEN, payload.tokens.accessToken);
      writeOptional(STORAGE_KEYS.REFRESH_TOKEN, payload.tokens.refreshToken);
      writeOptional(STORAGE_KEYS.SESSION_TOKEN, payload.tokens.sessionToken);
      writeOptional(STORAGE_KEYS.ORGANIZATION_ID, payload.organizationId);
      writeJson(STORAGE_KEYS.AUTH_USER, payload.user);
      writeJson(
        STORAGE_KEYS.AUTH_ORGANIZATIONS,
        payload.organizations.length ? payload.organizations : null,
      );
      set({
        tokens: payload.tokens,
        user: payload.user,
        organizations: payload.organizations,
        organizationId: payload.organizationId,
        deviceId: readDeviceId(),
        isAuthenticated: hasSessionTokens(payload.tokens),
        hasHydrated: true,
      });
    };

    const localTokens = readTokens();
    if (hasSessionTokens(localTokens)) {
      apply({
        tokens: localTokens,
        organizationId: readOrgId(),
        user: readUser(),
        organizations: readOrganizations(),
      });
      // Keep Electron store in sync with whatever localStorage still has.
      persistToElectron({
        tokens: localTokens,
        organizationId: readOrgId(),
        user: readUser(),
        organizations: readOrganizations(),
      });
      return;
    }

    // Packaged builds used a new random port each launch → empty localStorage.
    // Fall back to the durable Electron session.
    void readElectronSession().then((persisted) => {
      if (persisted && hasSessionTokens(persisted.tokens)) {
        apply(persisted);
        return;
      }
      set({
        tokens: { ...emptyTokens },
        user: null,
        organizations: [],
        organizationId: null,
        deviceId: readDeviceId(),
        isAuthenticated: false,
        hasHydrated: true,
      });
    });
  },

  setSession: (payload) => {
    const deviceId = ensureDeviceId();

    if (payload.accessToken !== undefined) {
      writeOptional(STORAGE_KEYS.AUTH_TOKEN, payload.accessToken);
    }
    if (payload.refreshToken !== undefined) {
      writeOptional(STORAGE_KEYS.REFRESH_TOKEN, payload.refreshToken);
    }
    if (payload.sessionToken !== undefined) {
      writeOptional(STORAGE_KEYS.SESSION_TOKEN, payload.sessionToken);
    }
    if (payload.organizationId !== undefined) {
      writeOptional(STORAGE_KEYS.ORGANIZATION_ID, payload.organizationId);
    }
    if (payload.user !== undefined) {
      writeJson(STORAGE_KEYS.AUTH_USER, payload.user);
    }
    if (payload.organizations !== undefined) {
      writeJson(
        STORAGE_KEYS.AUTH_ORGANIZATIONS,
        payload.organizations.length ? payload.organizations : null,
      );
    }

    const prev = get();
    const tokens: AuthTokensState = {
      accessToken:
        payload.accessToken !== undefined ? payload.accessToken : prev.tokens.accessToken,
      refreshToken:
        payload.refreshToken !== undefined ? payload.refreshToken : prev.tokens.refreshToken,
      sessionToken:
        payload.sessionToken !== undefined ? payload.sessionToken : prev.tokens.sessionToken,
    };

    const user = payload.user !== undefined ? payload.user : prev.user;
    const organizations =
      payload.organizations !== undefined ? payload.organizations : prev.organizations;
    const organizationId =
      payload.organizationId !== undefined ? payload.organizationId : prev.organizationId;

    set({
      user,
      organizations,
      organizationId,
      tokens,
      deviceId,
      isAuthenticated: hasSessionTokens(tokens),
      hasHydrated: true,
    });

    persistToElectron({ tokens, organizationId, user, organizations });
  },

  setOrganizationId: (organizationId) => {
    writeOptional(STORAGE_KEYS.ORGANIZATION_ID, organizationId);
    set({ organizationId });
    const current = get();
    persistToElectron({
      tokens: current.tokens,
      organizationId,
      user: current.user,
      organizations: current.organizations,
    });
  },

  setOrganizations: (organizations) => {
    writeJson(STORAGE_KEYS.AUTH_ORGANIZATIONS, organizations.length ? organizations : null);
    set({ organizations });
    const current = get();
    persistToElectron({
      tokens: current.tokens,
      organizationId: current.organizationId,
      user: current.user,
      organizations,
    });
  },

  clearSession: () => {
    writeOptional(STORAGE_KEYS.AUTH_TOKEN, null);
    writeOptional(STORAGE_KEYS.REFRESH_TOKEN, null);
    writeOptional(STORAGE_KEYS.SESSION_TOKEN, null);
    writeOptional(STORAGE_KEYS.ORGANIZATION_ID, null);
    writeJson(STORAGE_KEYS.AUTH_USER, null);
    writeJson(STORAGE_KEYS.AUTH_ORGANIZATIONS, null);
    clearElectronSession();
    set({
      user: null,
      organizations: [],
      organizationId: null,
      tokens: { ...emptyTokens },
      isAuthenticated: false,
      hasHydrated: true,
      deviceId: get().deviceId ?? readDeviceId(),
    });
  },
}));
