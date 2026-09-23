// SHOPORA — POST /api/admin/subscribers/[id]/suspend
// Platform admin suspends a business. THIS IS NOT A SECOND STATUS SYSTEM: it
// writes to the Phase 9 `Subscription` row exactly as a lapse would —
// status=suspended, currentPeriodEnd = now + SUSPEND_DAYS — so Phase 9's
// checkSubscription state machine keeps owning the timeline (suspended →
// cancelled if never reactivated) and the storefront/checkout gates behave
// identically to a natural lapse.

import { NextRequest } from 'next/server';
import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import {
  addDays,
  SUBSCRIPTION_STATUSES,
  SUSPEND_DAYS,
} from '@/lib/subscriptions/plans';
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

  await getSubscriptionState(business.id); // ensures a Subscription row exists

  const sub = await prisma.subscription.findUnique({ where: { businessId: business.id } });
  if (!sub) return authErrors.notFound('Business has no subscription');

  if (sub.status === SUBSCRIPTION_STATUSES.suspended) {
    return jsonOk({ status: sub.status, message: 'Business already suspended' });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SUBSCRIPTION_STATUSES.suspended,
        currentPeriodEnd: addDays(now, SUSPEND_DAYS),
        cancelledAt: null,
      },
    }),
    prisma.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: sub.status,
        toStatus: SUBSCRIPTION_STATUSES.suspended,
        note: 'Suspended by platform administrator',
      },
    }),
  ]);
  invalidateSubscriptionCache(business.id);
  await writeAuditLog({
    actorUserId: admin.userId,
    businessId: business.id,
    action: 'business.suspend',
    target: business.slug,
    metadata: { previousStatus: sub.status, name: business.name },
  });

  return jsonOk({ status: SUBSCRIPTION_STATUSES.suspended, message: 'Business suspended' });
});