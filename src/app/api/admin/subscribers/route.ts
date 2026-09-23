// SHOPORA — GET /api/admin/subscribers
// List all businesses on the platform with their subscription state.
// Filters: ?status=trial|active|past_due|suspended|cancelled|none&q=name|slug
// &page=&pageSize=. Detail lives at /api/admin/subscribers/[id].

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

const VALID_STATUSES = new Set(['trial', 'active', 'past_due', 'suspended', 'cancelled', 'none']);

export const GET = withAdminHandler('platform.subscribers.read', async (request: NextRequest) => {
  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  if (status && !VALID_STATUSES.has(status)) {
    return jsonOk({ businesses: [], total: 0, page, pageSize, totalPages: 0 });
  }

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.business.findMany({
    where,
    include: {
      subscription: {
        include: { plan: { select: { displayName: true, name: true } } },
      },
      _count: { select: { products: true, orders: true, staff: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const businesses = rows
    .map((b) => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      category: b.category,
      isActive: b.isActive,
      createdAt: b.createdAt,
      subscription: b.subscription
        ? {
            status: b.subscription.status,
            planKey: b.subscription.plan.name,
            planDisplayName: b.subscription.plan.displayName,
            billingCycle: b.subscription.billingCycle,
            currentPeriodEnd: b.subscription.currentPeriodEnd,
            trialEndsAt: b.subscription.trialEndsAt,
            cancelledAt: b.subscription.cancelledAt,
          }
        : null,
      counts: {
        products: b._count.products,
        orders: b._count.orders,
        staff: b._count.staff,
      },
    }))
    .filter((b) => {
      if (!status) return true;
      if (status === 'none') return !b.subscription;
      return b.subscription?.status === status;
    });

  return jsonOk({
    businesses,
    total: businesses.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(businesses.length / pageSize)),
  });
});