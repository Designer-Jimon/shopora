// SHOPORA — GET /api/businesses/check-slug?slug=...
// Checks whether a store URL slug is available. Returns availability plus a
// suggested alternative when taken. Optional auth: a session lets the caller
// exclude their own business from the collision check.

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { validateSlug } from '@/lib/validate';
import { withTenant } from '@/lib/withTenant';
import { getTenantContext } from '@/lib/tenant';

export const GET = withTenant(async (request: NextRequest) => {
  const raw = request.nextUrl.searchParams.get('slug') ?? '';
  const slug = raw.trim().toLowerCase();

  const slugErr = validateSlug(slug);
  if (slugErr) return authErrors.badRequest(slugErr);

  const ctx = getTenantContext();
  const ownBusinessId = ctx?.authenticated ? ctx.businessId : undefined;

  const owner = await prisma.business.findFirst({
    where: { slug, ...(ownBusinessId ? { id: { not: ownBusinessId } } : {}) },
    select: { id: true },
  });

  const available = !owner;

  if (available) {
    return jsonOk({ slug, available: true, suggestion: slug });
  }

  // Suggest the next free variant.
  let suggestion = slug;
  let counter = 2;
  for (;;) {
    const c = `${slug}-${counter}`;
    const taken = await prisma.business.findFirst({
      where: { slug: c, ...(ownBusinessId ? { id: { not: ownBusinessId } } : {}) },
      select: { id: true },
    });
    if (!taken) { suggestion = c; break; }
    counter++;
  }

  return jsonOk({ slug, available: false, suggestion });
});
