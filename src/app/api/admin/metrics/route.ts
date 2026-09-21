// SHOPORA — GET /api/admin/metrics
// Platform-wide dashboard numbers, computed from REAL aggregate queries
// (no stubs): business totals by subscription status, MRR (monthly-equivalent
// revenue of active/past_due subscriptions), and 30-day registration counts.

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';

export const GET = withAdminHandler('platform.dashboard', async () => {
  const now = new Date();
  const days30 = new Date(now.getTime() - 30 * 86400_000);

  const [
    totalBusinesses,
    byStatus,
    noSubscription,
    recentUsers,
    recentBusinesses,
    revenueAwareSubscriptions,
    orderTotals,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.subscription.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.business.count({ where: { subscription: null } }),
    prisma.user.count({ where: { createdAt: { gte: days30 } } }),
    prisma.business.count({ where: { createdAt: { gte: days30 } } }),
    prisma.subscription.findMany({
      where: { status: { in: [SUBSCRIPTION_STATUSES.active, SUBSCRIPTION_STATUSES.pastDue] } },
      select: { billingCycle: true, plan: { select: { monthlyPriceNaira: true, annualPriceNaira: true } } },
    }),
    prisma.transaction.aggregate({
      where: { status: 'success', type: 'payment', createdAt: { gte: days30 } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {
    trial: 0,
    active: 0,
    past_due: 0,
    suspended: 0,
    cancelled: 0,
    none: noSubscription,
  };
  for (const row of byStatus) {
    counts[row.status] = row._count._all;
  }

  let mrr = 0;
  for (const s of revenueAwareSubscriptions) {
    const appAmount = s.billingCycle === 'annual' ? Number(s.plan.annualPriceNaira) / 12 : Number(s.plan.monthlyPriceNaira);
    mrr += Number.isFinite(appAmount) ? appAmount : 0;
  }

  return jsonOk({
    totals: {
      businesses: totalBusinesses,
      users: await prisma.user.count(),
    },
    subscriptionStatus: counts,
    mrr,
    activeRevenue: revenueAwareSubscriptions.length,
    registrations30d: {
      users: recentUsers,
      businesses: recentBusinesses,
    },
    orderVolume30d: {
      amount: Number(orderTotals._sum.amount ?? 0),
      count: orderTotals._count._all,
    },
  });
});