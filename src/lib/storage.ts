// SHOPORA file storage — handles logo/banner uploads during onboarding.
//
// ⚠️ STORAGE BACKEND STATUS
// This phase uses LOCAL-FILESYSTEM storage: files are written under the app's
// `public/uploads/` directory and served statically. This is REAL persistence
// for dev/MVP (not faked), but it is NOT production-grade object storage.
//
// CLOUDFLARE WORKERS LIMITATION: Workers are stateless and have no writable
// filesystem — public/uploads/ will NOT persist there. Before deploying to
// Workers, switch to S3 or Cloudflare R2 and implement the matching
// upload/read methods in this module so URLs point at the object store.
// Any code calling saveFile() should treat the returned URL as opaque and
// remain driver-agnostic.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'public', 'uploads');

const PUBLIC_PREFIX = '/uploads';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file for logos/banners this phase

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export type StoredFile = {
  url: string;       // public URL the client should use
  sizeBytes: number;
  originalName: string;
};

const SAFE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB for product images

/**
 * Save an uploaded file buffer to local storage and return its public URL.
 * Flips to a driver wrapper when STORAGE_DRIVER != local.
 */
export async function saveFile(
  data: Buffer,
  originalName: string,
  kind: 'logo' | 'banner' | 'product' = 'logo',
): Promise<StoredFile> {
  if (STORAGE_DRIVER !== 'local') {
    throw new StorageError(
      `Storage driver '${STORAGE_DRIVER}' is not configured. This build supports 'local' only (set STORAGE_DRIVER=local). Object storage (S3/R2) is not configured in this phase.`,
    );
  }

  const isProduct = kind === 'product';
  const maxBytes = isProduct ? IMAGE_MAX_BYTES : MAX_BYTES;
  if (data.length > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new StorageError(`File exceeds the ${mb} MB limit`);
  }

  const ext = path.extname(originalName || '').toLowerCase();
  if (!SAFE_EXT.has(ext)) {
    throw new StorageError('Unsupported file type. Use PNG, JPG, WEBP, GIF, or SVG.');
  }

  const filename = `${crypto.randomUUID()}${ext}`;
  const dirMap: Record<string, string> = {
    logo: 'logos',
    banner: 'banners',
    product: 'products',
  };
  const relDir = path.join(dirMap[kind] ?? 'uploads', new Date().toISOString().slice(0, 10));
  const absDir = path.join(UPLOAD_DIR, relDir);
  await fs.mkdir(absDir, { recursive: true });

  const absPath = path.join(absDir, filename);
  await fs.writeFile(absPath, data);

  const url = `${PUBLIC_PREFIX}/${relDir.replace(/\\/g, '/')}/${filename}`;
  return { url, sizeBytes: data.length, originalName };
}

/** Read the public URL back to a filesystem path (for potential cleanup). */
export function publicUrlToPath(url: string): string | null {
  if (!url.startsWith(PUBLIC_PREFIX)) return null;
  const rel = url.slice(PUBLIC_PREFIX.length);
  return path.join(UPLOAD_DIR, rel);
}
