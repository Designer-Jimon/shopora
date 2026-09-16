// SHOPORA — GET /api/auth/me
// Returns the current authenticated user's info, business membership, and
// permissions. Requires a valid session (401 otherwise).

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant';
import { jsonOk, authErrors } from '@/lib/http';
import { withTenant } from '@/lib/withTenant';

export const GET = withTenant(async (_request: NextRequest) => {
  let ctx;
  try { ctx = requireAuth(); }
  catch { return authErrors.unauthorized(); }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId! },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  if (!user) return authErrors.unauthorized();

  let business = null;
  if (ctx.businessId) {
    business = await prisma.business.findUnique({
      where: { id: ctx.businessId },
      select: { id: true, name: true, slug: true },
    });
  }

  return jsonOk({
    user,
    business,
    businessRole: ctx.businessRole ?? null,
    permissions: ctx.permissions,
  });
});
