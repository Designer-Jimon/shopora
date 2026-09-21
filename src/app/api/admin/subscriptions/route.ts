// SHOPORA — GET /api/admin/subscriptions
// All subscription rows with plan + business, filterable by status/plan.
// ?status=&plan=&q=(business name)&page=&pageSize=

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const GET = withAdminHandler('platform.revenue.read', async (request: NextRequest) => {
  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? '';
  const planName = url.searchParams.get('plan') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (planName) where.plan = { name: planName };
  if (q) where.business = { name: { contains: q, mode: 'insensitive' } };

  const [rows, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        plan: { select: { name: true, displayName: true, monthlyPriceNaira: true, annualPriceNaira: true } },
        business: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.subscription.count({ where }),
  ]);

  return jsonOk({
    subscriptions: rows.map((s) => ({
      id: s.id,
      status: s.status,
      billingCycle: s.billingCycle,
      currentPeriodEnd: s.currentPeriodEnd,
      trialEndsAt: s.trialEndsAt,
      cancelledAt: s.cancelledAt,
      hasAuthorizationCode: !!s.paystackAuthorizationCode,
      business: s.business,
      plan: {
        key: s.plan.name,
        displayName: s.plan.displayName,
        monthlyPriceNaira: Number(s.plan.monthlyPriceNaira),
        annualPriceNaira: Number(s.plan.annualPriceNaira),
      },
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});