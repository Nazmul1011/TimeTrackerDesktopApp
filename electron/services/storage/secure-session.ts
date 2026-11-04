/**
 * Encrypts the persisted auth session with the OS keychain (Electron safeStorage).
 * Kept free of Electron imports so it can be unit tested with a fake cipher.
 */
export type SessionCipher = {
  isAvailable: () => boolean;
  encrypt: (plain: string) => Buffer;
  decrypt: (encrypted: Buffer) => string;
};

/** Returns base64 ciphertext, or null when OS encryption is not available. */
export function encryptSession(cipher: SessionCipher, session: unknown): string | null {
  if (!cipher.isAvailable()) return null;
  return cipher.encrypt(JSON.stringify(session)).toString("base64");
}

/** Returns the decoded session, or null if it cannot be decrypted (e.g. keychain reset). */
export function decryptSession(cipher: SessionCipher, encoded: string): unknown | null {
  if (!cipher.isAvailable()) return null;
  try {
    const parsed: unknown = JSON.parse(cipher.decrypt(Buffer.from(encoded, "base64")));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
