// SHOPORA payment secret store — AES-256-GCM encryption at rest.
//
// Each business brings its OWN Paystack secret key, so it can't live in a
// single env var. We encrypt it with a master key (KEY_ENCRYPTION_SECRET, with
// a documented dev fallback) and store the ciphertext in PaymentProviderSecret.
// The plaintext is only ever materialised inside a server process, for the
// moments a Paystack request/verification needs it, and is NEVER returned by
// any API route.
//
// Why encryption-at-rest + master key instead of KMS: this codebase is a
// self-hosted Next.js app with no cloud-infra wiring — a KMS reference would
// buy nothing here and add deploy friction. If the app moves to hosted
// infrastructure, swap the encrypt/decrypt point for a KMS envelope without
// touching any caller.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import prisma from '@/lib/prisma';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

/** Master key for encrypting provider secrets. Dev fallback keeps local runs working. */
export function getEncryptionSecret(): string {
  return process.env.KEY_ENCRYPTION_SECRET ?? 'shopora-dev-key-encryption-secret-change-me';
}

function masterKey(): Buffer {
  return createHash('sha256').update(getEncryptionSecret()).digest();
}

/**
 * Encrypt a secret key at rest. Returns `${version}:${ivHex}:${cipherHex}`
 * where cipherHex includes the GCM auth tag (last 16 bytes), so the IV and tag
 * travel with the ciphertext and key-rotation only needs the version.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${Buffer.concat([enc, tag]).toString('hex')}`;
}

/** Decrypt a value produced by encryptSecret. Throws on tampered input. */
export function decryptSecret(payload: string): string {
  const [version, ivHex, cipherHex] = payload.split(':');
  if (version !== VERSION || !ivHex || !cipherHex) {
    throw new Error('Unsupported or malformed secret payload');
  }
  const buf = Buffer.from(cipherHex, 'hex');
  if (buf.length <= 16) {
    throw new Error('Unsupported or malformed secret payload');
  }
  // GCM layout: ciphertext || authTag (last 16 bytes). Explicitly extract the
  // tag — relying on implicit trailing-tag behaviour varies across Node versions.
  const authTag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

/** Store/replace a provider's secret key (upsert by provider row). */
export async function saveProviderSecret(providerId: string, secretKey: string): Promise<void> {
  const encrypted = encryptSecret(secretKey);
  await prisma.paymentProviderSecret.upsert({
    where: { providerId },
    update: { encrypted, keyVersion: VERSION },
    create: { providerId, encrypted, keyVersion: VERSION },
  });
}

/**
 * Load + decrypt a provider's secret key server-side. Returns null when the
 * business has no connected provider or the row/secret is missing.
 */
export async function getProviderSecret(businessId: string, provider: string): Promise<string | null> {
  const row = await prisma.paymentProvider.findFirst({
    where: { businessId, provider },
    select: { id: true, secret: { select: { encrypted: true } } },
  });
  if (!row?.secret?.encrypted) return null;
  try {
    return decryptSecret(row.secret.encrypted);
  } catch {
    return null;
  }
}

/** Delete a provider's secret (used on disconnect). */
export async function deleteProviderSecret(providerId: string): Promise<void> {
  await prisma.paymentProviderSecret.deleteMany({ where: { providerId } });
}