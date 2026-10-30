/**
 * Sign-out used by the header menu and the menu-bar tray.
 */
import { authApi } from "@/services/api/auth.api";
import { getElectronAPI } from "@/services/electron";
import { persistLocalTimer } from "@/services/timer/offline-persist";
import { disconnectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export async function signOutSession(): Promise<void> {
  try {
    // The outbox needs this user's tokens, so give it a last chance to drain.
    await getElectronAPI()?.sync?.run?.();
    await authApi.logout();
  } finally {
    disconnectRealtime();
    useTimerStore.getState().reset();
    persistLocalTimer();
    useAuthStore.getState().clearSession();
  }
}
