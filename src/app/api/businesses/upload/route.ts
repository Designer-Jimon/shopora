// SHOPORA — POST /api/businesses/upload
// Upload a logo or banner image for the current business's onboarding
// (Step 4 branding). Multipart form: `file` (binary) + `kind` (logo|banner).
//
// Backend: LOCAL disk storage (see src/lib/storage.ts). S3/R2 object storage
// is NOT configured yet — flagged explicitly rather than silently faked.

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
  const kind = form.get('kind') === 'banner' ? 'banner' : 'logo';

  if (!(file instanceof File) || file.size === 0) {
    return authErrors.badRequest('A file is required');
  }

  const buffer = Buffer.from(await file.arrayBuffer()); // eslint-disable-line no-undef

  try {
    const stored = await saveFile(buffer, file.name, kind);
    return jsonOk({ url: stored.url, sizeBytes: stored.sizeBytes, kind });
  } catch (err) {
    if (err instanceof StorageError) {
      return jsonError(err.message, 400);
    }
    throw err;
  }
});
