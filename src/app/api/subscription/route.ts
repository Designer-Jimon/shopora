// SHOPORA — /api/subscription
//   GET  — current subscription state + usage + plan catalogue (owner-only).
//   POST — billing action for a plan (Phase 11, MONTHLY only — the native
//          Paystack subscription machinery owns one monthly plan per tier):
//       Free plan → instant in-app activation (downgrade/step-down, no
//                   Paystack call; ₦0).
//       Paid plan → native Paystack subscription checkout (hosted, returns
//                   authorizationUrl). Webhooks apply subscription.create /
//                   charge.success to activate and own renewals.
//       Already active on the requested paid plan → idempotent 'current_plan'.
//   Annual billing is reserved in the data model but NOT offered in Phase 11.

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { getSubscriptionState, ordersThisMonth } from '@/lib/subscriptions/state';
import { downgradeToFree } from '@/lib/subscriptions/downgrade';
import {
  BILLING_CYCLES,
  ensurePlansSeeded,
  PLAN_KEYS,
  type BillingCycle,
} from '@/lib/subscriptions/plans';
import {
  ensurePaystackPlanCode,
  getPrimaryOwnerEmail,
  initializeNativeSubscriptionCheckout,
} from '@/lib/payments/subscription';

export const GET = requireAuthHandler(async () => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const [state, plans, productsCount, staffCount, ordersCount] = await Promise.all([
    getSubscriptionState(ctx.businessId),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.count({ where: { businessId: ctx.businessId } }),
    prisma.businessStaff.count({
      where: { businessId: ctx.businessId, role: { name: { not: 'Owner' } }, isActive: true },
    }),
    ordersThisMonth(ctx.businessId),
  ]);

  return jsonOk({
    status: state.status,
    planKey: state.planKey,
    planDisplayName: state.planDisplayName,
    billingCycle: state.billingCycle,
    trialEndsAt: state.trialEndsAt,
    currentPeriodEnd: state.currentPeriodEnd,
    cancelledAt: state.cancelledAt,
    hasNativeSubscription: state.hasNativeSubscription,
    onFreePlan: state.onFreePlan,
    usage: {
      products: productsCount,
      productsLimit: state.productLimit,
      staff: staffCount,
      staffLimit: state.staffLimit,
      ordersThisMonth: ordersCount,
      orderLimit: state.orderLimit,
    },
    plans: plans.map((p) => ({
      key: p.name,
      displayName: p.displayName,
      description: p.description,
      monthlyPriceNaira: Number(p.monthlyPriceNaira),
      annualPriceNaira: Number(p.annualPriceNaira),
      productLimit: p.productLimit,
      staffLimit: p.staffLimit,
      orderLimit: p.orderLimit,
      customDomain: p.customDomain,
      removeBranding: p.removeBranding,
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
  if (cycle === BILLING_CYCLES.annual) {
    return authErrors.badRequest('Annual billing is not available yet — monthly only in this phase');
  }

  const plan = await prisma.subscriptionPlan.findUnique({ where: { name: planKey } });
  if (!plan || !plan.isActive) return authErrors.notFound('Plan not found');

  const state = await getSubscriptionState(ctx.businessId);

  // Free plan — no Paystack involved. This is the "downgrade / never paid"
  // step: activate (or keep) the Free row immediately and idempotently.
  if (plan.name === PLAN_KEYS.free) {
    await downgradeToFree(ctx.businessId, 'Moved to the free plan');
    return jsonOk({
      mode: 'free_activation',
      planKey: PLAN_KEYS.free,
      message: `You are now on the ${plan.displayName} plan`,
    });
  }

  const amount = Number(plan.monthlyPriceNaira);
  const email = await getPrimaryOwnerEmail(ctx.businessId);

  // Already active on exactly this paid plan via a live native subscription.
  if (
    state.status === 'active' &&
    state.planKey === planKey &&
    state.hasNativeSubscription &&
    state.currentPeriodEnd > new Date()
  ) {
    return jsonOk({ mode: 'current_plan', planKey });
  }

  // (Re)start the native subscription — hosted checkout with the plan code.
  const codeRes = await ensurePaystackPlanCode({
    id: plan.id,
    name: plan.name,
    displayName: plan.displayName,
    monthlyPriceNaira: plan.monthlyPriceNaira,
    paystackPlanCode: plan.paystackPlanCode,
  });
  if (!codeRes.ok) return jsonError(codeRes.error, 502);
  if (!email) return authErrors.badRequest('Store has no owner email — update settings first');

  const origin = request.nextUrl.origin;
  const init = await initializeNativeSubscriptionCheckout({
    businessId: ctx.businessId,
    planCode: codeRes.planCode,
    amount,
    email,
    callbackUrl: `${origin}/api/subscription/return`,
  });
  // Graceful offline degradation: never leak a raw Paystack body — surface a
  // storefront-friendly 502 that names Paystack so the caller can show
  // "Paystack unavailable right now" instead of a cryptic key error.
  if (!init.ok) return jsonError(`Paystack checkout is unavailable — ${init.error}`, 502);
  return jsonCreated({
    mode: 'native_subscription',
    authorizationUrl: init.authorizationUrl,
    providerRef: init.providerRef,
    planKey,
    amount,
    message: 'Authorising your recurring plan with Paystack…',
  });
});