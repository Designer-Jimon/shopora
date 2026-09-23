// SHOPORA — POST /api/admin/impersonate
// Start a time-limited, audited "log in as this business" session.
//   Requires: platform.impersonate permission (NOT implied by generic admin).
//   Writes:   AuditLog 'impersonate.start' (row is the requirement for this
//             feature to exist at all).
//   Returns:  sets the shopora_impersonation cookie (JWT, 30 min default) —
//             the business dashboard layout + tenant resolution then use it.
//   Blocks:   impersonating a business that does not exist.

import { NextRequest } from 'next/server';
import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { signImpersonationToken, impersonationTTLMinutes, IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { writeAuditLog } from '@/lib/audit';

export const POST = withAdminHandler('platform.impersonate', async (request: NextRequest) => {
  const admin = requireAuth();
  if (!admin.platformStaffId) return authErrors.forbidden();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const businessId = typeof body.businessId === 'string' ? body.businessId.trim() : '';
  if (!businessId) return authErrors.badRequest('businessId is required');

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, slug: true },
  });
  if (!business) return authErrors.notFound('Business not found');

  const token = await signImpersonationToken(admin.userId!, business.id);
  const ttlMin = impersonationTTLMinutes();

  await writeAuditLog({
    actorUserId: admin.userId,
    businessId: business.id,
    action: 'impersonate.start',
    target: business.slug,
    metadata: { businessName: business.name, ttlMinutes: ttlMin },
  });

  const res = jsonOk({
    message: `Now viewing as ${business.name}`,
    businessId: business.id,
    expiresInMinutes: ttlMin,
  });
  res.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ttlMin * 60,
  });
  return res;
});