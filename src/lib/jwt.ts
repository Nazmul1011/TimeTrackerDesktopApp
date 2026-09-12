/**
 * Lightweight JWT expiry checks (no signature verification).
 */

function decodePayload(token: string): { exp?: number } | null {
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { exp?: number };
  } catch {
    return null;
  }
}

/** True when the token is missing, expired, or within `skewMs` of expiry. */
export function isAccessTokenExpiring(token: string | null | undefined, skewMs = 60_000): boolean {
  if (!token) return true;
  const payload = decodePayload(token);
  if (typeof payload?.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now() + skewMs;
}
