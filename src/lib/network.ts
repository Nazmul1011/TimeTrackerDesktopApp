/**
 * Network / offline helpers for the desktop renderer.
 */
import type { AxiosError } from "axios";

export function isOfflineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function isNetworkError(err: unknown): boolean {
  if (isOfflineNow()) return true;
  if (!err || typeof err !== "object") return false;
  const error = err as AxiosError & { code?: string };
  if (
    error.code === "ERR_NETWORK" ||
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ERR_CANCELED"
  ) {
    return true;
  }
  if (!error.response && error.request) return true;
  const message = (error.message || "").toLowerCase();
  return (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("offline") ||
    message.includes("failed to fetch")
  );
}
