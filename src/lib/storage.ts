// SHOPORA file storage — logo/banner/product uploads.
//
// Two pluggable backends behind one seam (`saveFile` returns an OPAQUE URL; no
// caller branches on the driver):
//
//   STORAGE_DRIVER=local (default, dev/MVP)
//     Writes under public/uploads/ and serves them statically.
//     Real persistence for dev, but localStorage ≠ object storage.
//
//   STORAGE_DRIVER=r2 (production)
//     Uploads to a Cloudflare R2 bucket (S3-compatible) via @aws-sdk/client-s3.
//     Requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//     R2_BUCKET, and R2_PUBLIC_BASE_URL (public cache/custom-domain root the
//     returned URLs are built from). R2_ENDPOINT overrides the SDK endpoint for
//     other S3-compatible providers. See DEPLOYMENT.md.
//
// Note on deployment target: this module used to be the reason a Workers
// deploy was awkward — Workers have no writable filesystem. R2 removes that
// blocker (Phase 11 decision: still deploying on a normal Node host, but the
// storage no longer pins us to one).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

export const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'public', 'uploads');

const PUBLIC_PREFIX = '/uploads';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file for logos/banners
const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB for product images

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export type StoredFile = {
  url: string;       // public URL the client should use (opaque to callers)
  sizeBytes: number;
  originalName: string;
};

const SAFE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// ------------------------------------------------------------------
// R2 / S3-compatible client (lazy singleton)
// ------------------------------------------------------------------

let r2Client: S3Client | null = null;

function r2ConfigError(missing: string[]): StorageError {
  return new StorageError(
    `R2 storage is not configured: missing ${missing.join(', ')}. Set STORAGE_DRIVER=local to use local disk.`,
  );
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET || '';
  const baseUrl = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return { accountId, accessKeyId, secretAccessKey, bucket, baseUrl };
}

function getR2Client(): S3Client {
  if (r2Client) return r2Client;

  const { accountId, accessKeyId, secretAccessKey } = getR2Config();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw r2ConfigError(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
  }

  const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
  r2Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2Client;
}

// ------------------------------------------------------------------
// Shared validation
// ------------------------------------------------------------------

function validate(data: Buffer, originalName: string, kind: 'logo' | 'banner' | 'product'): { maxBytes: number; ext: string } {
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

  return { maxBytes, ext };
}

function relativeObjectKey(kind: 'logo' | 'banner' | 'product', ext: string): { filename: string; relDir: string } {
  const filename = `${crypto.randomUUID()}${ext}`;
  const dirMap: Record<string, string> = {
    logo: 'logos',
    banner: 'banners',
    product: 'products',
  };
  const relDir = path.join(dirMap[kind] ?? 'uploads', new Date().toISOString().slice(0, 10));
  return { filename, relDir };
}

// ------------------------------------------------------------------
// Public API — driver-agnostic
// ------------------------------------------------------------------

/**
 * Save an uploaded file buffer and return its public URL.
 * Honours STORAGE_DRIVER: 'local' (disk) or 'r2' (Cloudflare R2 / S3).
 */
export async function saveFile(
  data: Buffer,
  originalName: string,
  kind: 'logo' | 'banner' | 'product' = 'logo',
): Promise<StoredFile> {
  const { ext } = validate(data, originalName, kind);

  if (STORAGE_DRIVER === 'r2') {
    return saveFileR2(data, originalName, kind, ext);
  }

  if (STORAGE_DRIVER !== 'local') {
    throw new StorageError(
      `Unknown storage driver '${STORAGE_DRIVER}'. Supported: local, r2.`,
    );
  }

  const { filename, relDir } = relativeObjectKey(kind, ext);
  const absDir = path.join(UPLOAD_DIR, relDir);
  await fs.mkdir(absDir, { recursive: true });
  await fs.writeFile(path.join(absDir, filename), data);

  const url = `${PUBLIC_PREFIX}/${relDir.replace(/\\/g, '/')}/${filename}`;
  return { url, sizeBytes: data.length, originalName };
}

async function saveFileR2(
  data: Buffer,
  originalName: string,
  kind: 'logo' | 'banner' | 'product',
  ext: string,
): Promise<StoredFile> {
  const { bucket, baseUrl } = getR2Config();
  if (!bucket || !baseUrl) {
    throw r2ConfigError(bucket ? ['R2_PUBLIC_BASE_URL'] : ['R2_BUCKET', 'R2_PUBLIC_BASE_URL']);
  }

  const { filename, relDir } = relativeObjectKey(kind, ext);
  const key = `uploads/${relDir.replace(/\\/g, '/')}/${filename}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
    }),
  );

  return { url: `${baseUrl}/${key}`, sizeBytes: data.length, originalName };
}

/** Read a local-file URL back to a filesystem path (cleanup; local driver only). */
export function publicUrlToPath(url: string): string | null {
  if (!url.startsWith(PUBLIC_PREFIX)) return null;
  const rel = url.slice(PUBLIC_PREFIX.length);
  return path.join(UPLOAD_DIR, rel);
}