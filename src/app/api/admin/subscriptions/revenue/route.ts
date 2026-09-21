// SHOPORA — GET /api/admin/subscriptions/revenue
// Subscription-revenue analytics from REAL transaction data (type='subscription',
// i.e. the platform's own Paystack revenue) + current MRR snapshot.

import { NextRequest } from 'next/server';
import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const GET = withAdminHandler('platform.revenue.read', async (request: NextRequest) => {
  const months = Math.min(24, Math.max(1, parseInt(request.nextUrl.searchParams.get('months') ?? '6', 10) || 6));

  const [transactions, subscriptions, plans] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: 'subscription' },
      select: { amount: true, status: true, createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ['active', 'past_due'] } },
      select: { billingCycle: true, plan: { select: { monthlyPriceNaira: true, annualPriceNaira: true } } },
    }),
    prisma.subscriptionPlan.findMany({ select: { monthlyPriceNaira: true, annualPriceNaira: true } }),
  ]);

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const startKey = monthKey(start);

  const buckets = new Map<string, { month: string; grossNaira: number; count: number; successfulCount: number }>();
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getTime());
    d.setUTCMonth(d.getUTCMonth() + i);
    const k = monthKey(d);
    buckets.set(k, { month: k, grossNaira: 0, count: 0, successfulCount: 0 });
  }

  let lifetimeGross = 0;
  for (const t of transactions) {
    const k = monthKey(t.createdAt);
    const amount = Number(t.amount);
    if (!buckets.has(k)) continue;
    lifetimeGross += (t.status === 'success' ? amount : 0);
    const b = buckets.get(k)!;
    b.count += 1;
    if (t.status === 'success') b.successfulCount += 1;
    b.grossNaira += (t.status === 'success' ? amount : 0);
  }

  let mrr = 0;
  for (const s of subscriptions) {
    const rev = s.billingCycle === 'annual' ? Number(s.plan.annualPriceNaira) / 12 : Number(s.plan.monthlyPriceNaira);
    if (Number.isFinite(rev)) mrr += rev;
  }

  const planAverages = plans.reduce(
    (acc, p) => {
      const m = Number(p.monthlyPriceNaira);
      acc.monthlyTotal += m;
      acc.monthlyCount += 1;
      return acc;
    },
    { monthlyTotal: 0, monthlyCount: 0 },
  );

  return jsonOk({
    byMonth: [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)),
    mrr,
    monthlySubscriptionCount: subscriptions.length,
    lifetimeGross,
    averageMonthlyPlanPrice: planAverages.monthlyCount > 0 ? planAverages.monthlyTotal / planAverages.monthlyCount : 0,
  });
});