// SHOPORA — POST /api/businesses/upload
// Upload a logo, banner, or Design Studio image for the current business.
// Multipart form: `file` (binary) + `kind` (logo|banner|design).
//
// Backend: LOCAL disk storage (see src/lib/storage.ts). S3/R2 object storage
// is NOT configured yet — flagged explicitly rather than silently faked.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { requireAuth } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { StorageError, saveFile } from '@/lib/storage';

const KINDS = new Set(['logo', 'banner', 'design']);

export const POST = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requireAuth();
  if (ctx.role !== 'business_user' || !ctx.businessId) {
    return authErrors.forbidden();
  }

  const form = await request.formData();
  const file = form.get('file');
  const kind = form.get('kind');
  const kindStr = typeof kind === 'string' && KINDS.has(kind) ? kind : 'logo';

  if (!(file instanceof File) || file.size === 0) {
    return authErrors.badRequest('A file is required');
  }

  const buffer = Buffer.from(await file.arrayBuffer()); // eslint-disable-line no-undef

  try {
    const stored = await saveFile(buffer, file.name, kindStr as 'logo' | 'banner' | 'design');
    return jsonOk({ url: stored.url, sizeBytes: stored.sizeBytes, kind: kindStr });
  } catch (err) {
    if (err instanceof StorageError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }
});
