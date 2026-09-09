/**
 * Auth Zustand store — session, orgs, tokens, device.
 * Tokens are mirrored to Electron main so production restarts stay signed in.
 */
import { create } from "zustand";
import { STORAGE_KEYS } from "@/constants/storage";
import { ensureDeviceId } from "@/services/api/client";
import {
  clearPersistedAuthSession,
  savePersistedAuthSession,
} from "@/services/electron/auth-session";
import type { OrganizationWithMembership } from "@/services/api/types";
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
  sessionHydrated: boolean;
  setSession: (payload: {
    user?: User | null;
    organizations?: OrganizationWithMembership[];
    organizationId?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    sessionToken?: string | null;
    deviceId?: string | null;
  }) => void;
  setOrganizationId: (organizationId: string | null) => void;
  setOrganizations: (organizations: OrganizationWithMembership[]) => void;
  markSessionHydrated: () => void;
  clearSession: () => void;
}

function readInitialDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
}

function readInitialTokens(): AuthTokensState {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, sessionToken: null };
  }
  return {
    accessToken: localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
    refreshToken: localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN),
    sessionToken: localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN),
  };
}

function readInitialOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.ORGANIZATION_ID);
}

function persistToElectron() {
  const state = useAuthStore.getState();
  savePersistedAuthSession({
    accessToken: state.tokens.accessToken,
    refreshToken: state.tokens.refreshToken,
    sessionToken: state.tokens.sessionToken,
    organizationId: state.organizationId,
    deviceId: state.deviceId,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organizations: [],
  organizationId: readInitialOrgId(),
  tokens: readInitialTokens(),
  deviceId: readInitialDeviceId(),
  isAuthenticated: Boolean(readInitialTokens().accessToken),
  sessionHydrated: false,

  setSession: (payload) => {
    const deviceId = payload.deviceId ?? ensureDeviceId();
    if (payload.deviceId) {
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, payload.deviceId);
    }

    if (payload.accessToken !== undefined) {
      if (payload.accessToken) {
        localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, payload.accessToken);
      } else {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      }
    }
    if (payload.refreshToken !== undefined) {
      if (payload.refreshToken) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, payload.refreshToken);
      } else {
        localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      }
    }
    if (payload.sessionToken !== undefined) {
      if (payload.sessionToken) {
        localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, payload.sessionToken);
      } else {
        localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
      }
    }
    if (payload.organizationId !== undefined) {
      if (payload.organizationId) {
        localStorage.setItem(
          STORAGE_KEYS.ORGANIZATION_ID,
          payload.organizationId,
        );
      } else {
        localStorage.removeItem(STORAGE_KEYS.ORGANIZATION_ID);
      }
    }

    const prev = get();
    const tokens: AuthTokensState = {
      accessToken:
        payload.accessToken !== undefined
          ? payload.accessToken
          : prev.tokens.accessToken,
      refreshToken:
        payload.refreshToken !== undefined
          ? payload.refreshToken
          : prev.tokens.refreshToken,
      sessionToken:
        payload.sessionToken !== undefined
          ? payload.sessionToken
          : prev.tokens.sessionToken,
    };

    const user = payload.user !== undefined ? payload.user : prev.user;
    const organizationId =
      payload.organizationId !== undefined
        ? payload.organizationId
        : prev.organizationId;

    set({
      user,
      organizations:
        payload.organizations !== undefined
          ? payload.organizations
          : prev.organizations,
      organizationId,
      tokens,
      deviceId,
      isAuthenticated: Boolean(tokens.accessToken || tokens.refreshToken),
    });
    persistToElectron();
  },

  setOrganizationId: (organizationId) => {
    if (organizationId) {
      localStorage.setItem(STORAGE_KEYS.ORGANIZATION_ID, organizationId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ORGANIZATION_ID);
    }
    set({ organizationId });
    persistToElectron();
  },

  setOrganizations: (organizations) => set({ organizations }),

  markSessionHydrated: () => set({ sessionHydrated: true }),

  clearSession: () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.ORGANIZATION_ID);
    clearPersistedAuthSession();
    set({
      user: null,
      organizations: [],
      organizationId: null,
      tokens: {
        accessToken: null,
        refreshToken: null,
        sessionToken: null,
      },
      isAuthenticated: false,
      deviceId: get().deviceId ?? readInitialDeviceId(),
    });
  },
}));
