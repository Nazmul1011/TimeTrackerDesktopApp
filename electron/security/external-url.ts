/**
 * Only web and mail links may be handed to the OS. Other schemes (file:,
 * smb:, custom app protocols) can launch local programs.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function isSafeExternalUrl(value: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
