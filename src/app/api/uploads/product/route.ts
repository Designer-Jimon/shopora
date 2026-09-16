// SHOPORA — POST /api/uploads/product
// Upload product images. Multipart form: `file` (binary).
// Backend: LOCAL disk storage (see src/lib/storage.ts).
// ⚠️ Same Cloudflare Workers limitation as Phase 3 — no writable FS.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { requireAuth } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { StorageError, saveFile } from '@/lib/storage';

export const POST = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requireAuth();
  if (ctx.role !== 'business_user' || !ctx.businessId) {
    return authErrors.forbidden();
  }

  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    return authErrors.badRequest('A file is required');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const stored = await saveFile(buffer, file.name, 'product');
    return jsonOk({ url: stored.url, sizeBytes: stored.sizeBytes });
  } catch (err) {
    if (err instanceof StorageError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }
});
