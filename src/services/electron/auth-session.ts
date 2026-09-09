/**
 * Persist auth in Electron main (electron-store), not just renderer localStorage.
 */
import { getElectronAPI } from "./bridge";

export type PersistedAuthSession = {
  accessToken: string | null;
  refreshToken: string | null;
  sessionToken: string | null;
  organizationId: string | null;
  deviceId: string | null;
};

export async function loadPersistedAuthSession(): Promise<PersistedAuthSession | null> {
  const api = getElectronAPI();
  if (!api?.auth?.getSession) return null;
  const session = await api.auth.getSession();
  if (!session) return null;
  if (!session.accessToken && !session.refreshToken) return null;
  return session;
}

export function savePersistedAuthSession(session: PersistedAuthSession): void {
  const api = getElectronAPI();
  if (!api?.auth?.saveSession) return;
  void api.auth.saveSession(session);
}

export function clearPersistedAuthSession(): void {
  const api = getElectronAPI();
  if (!api?.auth?.logout) return;
  void api.auth.logout();
}
