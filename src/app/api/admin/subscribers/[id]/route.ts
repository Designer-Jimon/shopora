// SHOPORA — GET /api/admin/subscribers/[id]
// Business detail with subscription, usage counts, recent orders and the
// Owner's contact info (for the Super Admin detail view).

import { NextRequest } from 'next/server';
import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const GET = withAdminHandler('platform.subscribers.read', async (
  _request: NextRequest,
  ctx,
) => {
  const id = String((ctx.params as Record<string, string>).id ?? '');
  if (!id) return authErrors.badRequest('Business id required');

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true, history: { orderBy: { changedAt: 'asc' } } } },
      staff: {
        include: { user: { select: { email: true, firstName: true, lastName: true } }, role: true },
      },
      paymentProviders: { select: { provider: true, status: true, publicKey: true, connectedAt: true, updatedAt: true } },
      _count: { select: { products: true, orders: true, categories: true } },
    },
  });
  if (!business) return authErrors.notFound('Business not found');

  const owner = business.staff.find((s) => s.role.name === 'Owner' && s.isActive);

  return jsonOk({
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      description: business.description,
      category: business.category,
      phone: business.phone,
      address: business.address,
      isActive: business.isActive,
      createdAt: business.createdAt,
      counts: {
        products: business._count.products,
        orders: business._count.orders,
        categories: business._count.categories,
        staff: business.staff.length,
      },
      owner: owner ? { email: owner.user.email, firstName: owner.user.firstName, lastName: owner.user.lastName } : null,
      paymentProviders: business.paymentProviders,
    },
    subscription: business.subscription
      ? {
          id: business.subscription.id,
          status: business.subscription.status,
          billingCycle: business.subscription.billingCycle,
          currentPeriodEnd: business.subscription.currentPeriodEnd,
          trialEndsAt: business.subscription.trialEndsAt,
          cancelledAt: business.subscription.cancelledAt,
          plan: {
            key: business.subscription.plan.name,
            displayName: business.subscription.plan.displayName,
            monthlyPriceNaira: Number(business.subscription.plan.monthlyPriceNaira),
            annualPriceNaira: Number(business.subscription.plan.annualPriceNaira),
            productLimit: business.subscription.plan.productLimit,
            staffLimit: business.subscription.plan.staffLimit,
          },
          history: business.subscription.history,
        }
      : null,
  });
});