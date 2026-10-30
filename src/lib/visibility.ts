/**
 * Window visibility helpers. The window is "hidden" while it sits in the tray
 * or is minimized; background refreshes skip work then and catch up on show.
 */

export function isPageHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Calls `fn` each time the window becomes visible again. Returns an unsubscribe. */
export function onPageVisible(fn: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "visible") fn();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
