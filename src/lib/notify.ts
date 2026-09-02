/**
 * Desktop notification helpers — in-app toast + optional OS notification.
 */
import { toast } from "sonner";
import { getElectronAPI, isElectron } from "@/services/electron";
import { useSettingsStore } from "@/store/settings.store";

export function notificationsAllowed(): boolean {
  return useSettingsStore.getState().settings.notificationsEnabled;
}

/** In-app toast only when notifications preference is on. */
export function notifyToast(
  kind: "success" | "error" | "warning" | "message",
  message: string,
): void {
  if (!notificationsAllowed() && kind !== "error") return;
  if (kind === "success") toast.success(message);
  else if (kind === "error") toast.error(message);
  else if (kind === "warning") toast.warning(message);
  else toast.message(message);
}

/**
 * Native OS notification when preference is on (Electron only).
 * Idle auto-pause uses main-process notifications directly.
 */
export async function notifyOs(title: string, body: string): Promise<void> {
  if (!notificationsAllowed()) return;
  if (!isElectron()) return;
  const api = getElectronAPI();
  if (!api?.notification?.show) return;
  try {
    const result = await api.notification.show({ title, body });
    if (result && !result.ok) {
      console.warn("[notify] OS notification failed:", result.message);
    }
  } catch (err) {
    console.warn("[notify] OS notification error", err);
  }
}

/** Toast + OS notification for tracking / idle events. */
export async function notifyAlert(
  title: string,
  body: string,
  kind: "success" | "warning" | "error" = "warning",
): Promise<void> {
  notifyToast(kind, body);
  await notifyOs(title, body);
}
