// SHOPORA — /api/subscription
//   GET — current subscription state + usage + plan catalogue (owner-only).
//   POST /api/subscription/checkout — start/continue billing for a plan:
//       first payment → hosted Paystack checkout (returns authorizationUrl);
//       renewal on a stored authorization code → direct charge (webhook flips
//       the subscription to active).

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { getSubscriptionState } from '@/lib/subscriptions/state';
import {
  BILLING_CYCLES,
  ensurePlansSeeded,
  priceForCycle,
  type BillingCycle,
} from '@/lib/subscriptions/plans';
import {
  chargeAuthorization,
  getPrimaryOwnerEmail,
  initializeSubscriptionCheckout,
} from '@/lib/payments/subscription';

export const GET = requireAuthHandler(async () => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const [state, plans, productsCount, staffCount] = await Promise.all([
    getSubscriptionState(ctx.businessId),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.count({ where: { businessId: ctx.businessId } }),
    prisma.businessStaff.count({
      where: { businessId: ctx.businessId, role: { name: { not: 'Owner' } }, isActive: true },
    }),
  ]);

  return jsonOk({
    status: state.status,
    planKey: state.planKey,
    planDisplayName: state.planDisplayName,
    billingCycle: state.billingCycle,
    trialEndsAt: state.trialEndsAt,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelledAt: state.cancelledAt,
    hasAuthorizationCode: state.hasAuthorizationCode,
    usage: {
      products: productsCount,
      productsLimit: state.productLimit,
      staff: staffCount,
      staffLimit: state.staffLimit,
    },
    plans: plans.map((p) => ({
      key: p.name,
      displayName: p.displayName,
      description: p.description,
      monthlyPriceNaira: Number(p.monthlyPriceNaira),
      annualPriceNaira: Number(p.annualPriceNaira),
      productLimit: p.productLimit,
      staffLimit: p.staffLimit,
      customDomain: p.customDomain,
      analyticsTier: p.analyticsTier,
    })),
  });
});

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('subscription.manage');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  await ensurePlansSeeded();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const planKey = typeof body.planKey === 'string' ? body.planKey.trim().toLowerCase() : '';
  const cycleRaw = typeof body.billingCycle === 'string' ? body.billingCycle : BILLING_CYCLES.monthly;
  const cycle: BillingCycle | null =
    cycleRaw === BILLING_CYCLES.monthly || cycleRaw === BILLING_CYCLES.annual ? cycleRaw : null;

  if (!planKey) return authErrors.badRequest('planKey is required');
  if (!cycle) return authErrors.badRequest('billingCycle must be monthly or annual');

  const plan = await prisma.subscriptionPlan.findUnique({ where: { name: planKey } });
  if (!plan || !plan.isActive) return authErrors.notFound('Plan not found');

  const state = await getSubscriptionState(ctx.businessId);
  const amount = priceForCycle({ monthlyPriceNaira: Number(plan.monthlyPriceNaira), annualPriceNaira: Number(plan.annualPriceNaira) }, cycle);
  const email = await getPrimaryOwnerEmail(ctx.businessId);

  const targetPlanChanged = state.planKey !== planKey;

  const origin = request.nextUrl.origin;

  // First payment (no reusable authorization code yet) → hosted checkout so we
  // can capture the authorization code for future renewals.
  if (!state.hasAuthorizationCode || targetPlanChanged) {
    if (!email) return authErrors.badRequest('Store has no owner email — update settings first');
    const init = await initializeSubscriptionCheckout({
      businessId: ctx.businessId,
      amount,
      email,
      callbackUrl: `${origin}/api/subscription/return`,
    });
    if (!init.ok) return jsonError(init.error, 502);
    return jsonOk({
      mode: targetPlanChanged ? 'upgrade_checkout' : 'first_payment',
      authorizationUrl: init.authorizationUrl,
      providerRef: init.providerRef,
      amount,
    });
  }

  // Renewal on the stored authorization code — no customer interaction. The
  // resulting charge.success webhook flips the subscription to active.
  if (!email) return authErrors.badRequest('Store has no owner email — update settings first');
  const charge = await chargeAuthorization({ businessId: ctx.businessId, email, amount });
  if (!charge.ok) return jsonError(charge.error, 502);
  return jsonCreated({
    mode: 'renewal_charge',
    providerRef: charge.providerRef,
    amount,
  });
});