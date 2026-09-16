// SHOPORA — POST /api/businesses/suggest-slug
// Returns a suggested unique store URL slug derived from a business name.
// Optional auth: works without a session so the register/onboarding UI can
// preview slugs, but when a session is present it can suggest a slug for the
// owner's own business.

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { slugify } from '@/lib/validate';
import { withTenant } from '@/lib/withTenant';
import { getTenantContext } from '@/lib/tenant';

export const POST = withTenant(async (request: NextRequest) => {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return authErrors.badRequest('Business name is required to suggest a slug');

  const base = slugify(name) || 'business';

  // Build a unique slug, skipping slugs already taken (optionally excluding the
  // caller's own business when known).
  const ctx = getTenantContext();
  const ownBusinessId = ctx?.authenticated ? ctx.businessId : undefined;

  let candidate = base;
  let counter = 2;
  for (;;) {
    const owner = await prisma.business.findFirst({
      where: { slug: candidate, ...(ownBusinessId ? { id: { not: ownBusinessId } } : {}) },
      select: { id: true },
    });
    if (!owner) break;
    candidate = `${base}-${counter}`;
    counter++;
  }

  return jsonOk({ slug: candidate });
});
