// SHOPORA — POST /api/admin/impersonate/end
// Manually end an impersonation session: clears the cookie and writes an
// 'impersonate.end' AuditLog row keyed to whatever business the cookie pointed
// at. Auto-expiry (JWT exp) is handled by resolution-time verification.

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import {
  IMPERSONATION_COOKIE,
  readImpersonationFromRequest,
} from '@/lib/impersonation';
import { writeAuditLog } from '@/lib/audit';

export const POST = withAdminHandler('platform.impersonate', async (request: NextRequest) => {
  const admin = requireAuth();

  const active = await readImpersonationFromRequest(request);
  if (active) {
    await writeAuditLog({
      actorUserId: admin.userId,
      businessId: active.businessId,
      action: 'impersonate.end',
      target: 'manual-end',
      metadata: { endedBy: admin.userId },
    });
  }

  const res = jsonOk({ message: 'Impersonation ended' });
  res.cookies.set(IMPERSONATION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
});