/**
 * Allowed renderer origin for navigation guards.
 * Dev: Next.js on :3000. Packaged: local static server started at runtime.
 */
let rendererOrigin = (process.env.ELECTRON_RENDERER_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

export function setRendererOrigin(url: string): void {
  try {
    rendererOrigin = new URL(url).origin;
  } catch {
    rendererOrigin = url.replace(/\/$/, "");
  }
}

export function getRendererOrigin(): string {
  return rendererOrigin;
}

export function isRendererNavigationAllowed(navigationUrl: string): boolean {
  try {
    const parsed = new URL(navigationUrl);
    if (parsed.protocol === "file:") return true;
    return parsed.origin === new URL(rendererOrigin).origin;
  } catch {
    return false;
  }
}
