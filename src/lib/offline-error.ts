/** Axios "Network Error" and a dropped connection, not a server rejection. */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (typeof err !== "object" || err === null) return false;
  const error = err as { code?: string; message?: string; response?: unknown };
  if (error.response) return false;
  if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") return true;
  const message = (error.message ?? "").toLowerCase();
  return message === "network error" || message.includes("network") || message.includes("timeout");
}
