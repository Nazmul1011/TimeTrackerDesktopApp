/**
 * Sign-out used by the header menu and the menu-bar tray.
 */
import { authApi } from "@/services/api/auth.api";
import { disconnectRealtime } from "@/services/realtime/socket";
import { useAuthStore } from "@/store/auth.store";
import { useTimerStore } from "@/store/timer.store";

export async function signOutSession(): Promise<void> {
  try {
    await authApi.logout();
  } finally {
    disconnectRealtime();
    useTimerStore.getState().reset();
    useAuthStore.getState().clearSession();
  }
}
