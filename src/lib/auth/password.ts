// SHOPORA auth passwords — argon2id hashing via the argon2 package.
// All hashes use the PHC winner argon2id: memory-hard, GPU-resistant.
// The argon2 package ships prebuilt binaries for win32-x64.

import { hash, verify, type HashOptions } from 'argon2';
import { Buffer } from 'node:buffer';

const HASH_OPTIONS: HashOptions = {
  type: 2, // argon2id (0 = argon2d, 1 = argon2i, 2 = argon2id)
  memoryCost: 65536,   // 64 MB
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

export async function hashPassword(plaintext: string): Promise<string> {
  const result = await hash(plaintext, HASH_OPTIONS);
  // argon2 returns a Buffer; normalise to a utf8 string for storage
  return Buffer.from(result).toString('utf8');
}

export async function verifyPassword(
  hashed: string,
  plaintext: string,
): Promise<boolean> {
  return verify(hashed, plaintext);
}

/** Generate a cryptographically-random hex token for password reset flows. */
export function generateResetToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash a reset token for storage (we never store raw tokens). */
export async function hashResetToken(token: string): Promise<string> {
  // SHA-256 is fine here — the token is high-entropy and we just need
  // a fast constant-time lookup, not a slow password-style hash.
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
