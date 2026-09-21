// SHOPORA — POST /api/admin/subscribers/[id]/reactivate
// Platform admin reactivates a business. Writes status=active with a fresh
// period (now + 30 days) so Phase 9's state machine treats it as an in-good-
// standing subscriber again. Audited.

import { NextRequest } from 'next/server';
import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { addDays, SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';
import { getSubscriptionState, invalidateSubscriptionCache } from '@/lib/subscriptions/state';
import { writeAuditLog } from '@/lib/audit';

export const POST = withAdminHandler('platform.business.manage', async (
  _request: NextRequest,
  ctx,
) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const business = await prisma.business.findUnique({ where: { id }, select: { id: true, name: true, slug: true } });
  if (!business) return authErrors.notFound('Business not found');

  await getSubscriptionState(business.id);

  const sub = await prisma.subscription.findUnique({ where: { businessId: business.id } });
  if (!sub) return authErrors.notFound('Business has no subscription');

  if (sub.status === SUBSCRIPTION_STATUSES.active) {
    return jsonOk({ status: sub.status, message: 'Business already active' });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SUBSCRIPTION_STATUSES.active,
        currentPeriodEnd: addDays(now, 30),
        cancelledAt: null,
      },
    }),
    prisma.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: sub.status,
        toStatus: SUBSCRIPTION_STATUSES.active,
        note: 'Reactivated by platform administrator',
      },
    }),
  ]);
  invalidateSubscriptionCache(business.id);
  await writeAuditLog({
    actorUserId: admin.userId,
    businessId: business.id,
    action: 'business.reactivate',
    target: business.slug,
    metadata: { previousStatus: sub.status, name: business.name },
  });

  return jsonOk({ status: SUBSCRIPTION_STATUSES.active, message: 'Business reactivated' });
});