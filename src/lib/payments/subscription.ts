// SHOPORA subscription billing — Paystack operations collected on the
// PLATFORM's Paystack account (the store owner is SHOPORA's customer here;
// their own connected Paystack still handles store checkout). Nothing here
// touches order-payment logic.
//
// Phase 11 flows (NATIVE Paystack Subscriptions — Paystack owns the schedule):
//   1. ensurePaystackPlanCode → lazily creates the monthly Paystack Plan
//      (PLN_…) for a paid SubscriptionPlan row.
//   2. initializeNativeSubscriptionCheckout → hosted checkout that SUBSCRIBES
//      the customer (transaction/initialize with `plan`). On success Paystack
//      fires charge.success + subscription.create webhooks.
//   3. Webhooks drive state: subscription.create (link + activate),
//      charge.success (initial via pre-recorded transaction, renewals via
//      subscription_code), invoice.payment_failed / subscription.disable
//      (downgrade to Free — see src/lib/subscriptions/webhooks.ts).
//
// The Phase 9 legacy path (hosted one-off checkout + chargeAuthorization +
// applySubscriptionPaymentSuccess on SP-SUB-* references) is retained so
// already-initiated legacy sessions keep settling.

const PAYSTACK_API = 'https://api.paystack.co';
const TIMEOUT_MS = 15000;
const SUB_REF_PREFIX = 'SP-SUB-';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PaystackProvider } from './paystack';
import { PAYMENT_PROVIDERS, type VerifyTransactionResult } from './types';
import { addDays, BILLING_CYCLES, PLAN_KEYS, priceForCycle, SUBSCRIPTION_STATUSES, type BillingCycle } from '@/lib/subscriptions/plans';
import { invalidateSubscriptionCache } from '@/lib/subscriptions/state';

/** The platform's own Paystack secret (subscription revenue comes to SHOPORA). */
export function getPlatformPaystackSecret(): string | null {
  return process.env.PAYSTACK_SECRET_KEY ?? null;
}

export function buildSubscriptionRef(): string {
  return `${SUB_REF_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSubscriptionRef(reference: string): boolean {
  return reference.startsWith(SUB_REF_PREFIX);
}

async function platformFetch(url: string, init: RequestInit): Promise<Response> {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  return fetch(url, { ...init, signal });
}

/** The business's primary owner email (what Paystack needs on initialize). */
export async function getPrimaryOwnerEmail(businessId: string): Promise<string | null> {
  const row = await prisma.businessStaff.findFirst({
    where: { businessId, role: { name: 'Owner' }, isActive: true },
    select: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return row?.user.email ?? null;
}

/** Record the platform-side initiated transaction (orderId null, type subscription). */
export async function recordSubscriptionTransaction(input: {
  businessId: string;
  providerRef: string;
  amount: number;
}): Promise<void> {
  await prisma.transaction.create({
    data: {
      businessId: input.businessId,
      orderId: null,
      provider: PAYMENT_PROVIDERS.paystack,
      providerRef: input.providerRef,
      amount: new Prisma.Decimal(Number.isFinite(input.amount) ? input.amount.toFixed(2) : '0'),
      status: 'initiated',
      type: 'subscription',
    },
  });
}

/**
 * Start the first subscription payment (hosted checkout). Records the
 * subscription Transaction row so a later webhook/verify can resolve it.
 */
export async function initializeSubscriptionCheckout(input: {
  businessId: string;
  amount: number;
  email: string;
  callbackUrl: string;
}): Promise<
  | { ok: true; providerRef: string; authorizationUrl: string }
  | { ok: false; error: string }
> {
  const secret = getPlatformPaystackSecret();
  if (!secret) return { ok: false, error: 'Platform Paystack is not configured' };

  const provider = new PaystackProvider(secret);
  const init = await provider.initializeTransaction({
    orderId: '', // placeholder — initializeTransaction requires an orderId string
    orderNumber: 'SUBSCRIPTION',
    amount: input.amount,
    email: input.email,
    callbackUrl: input.callbackUrl,
  });
  if (!init.ok) return init;
  await recordSubscriptionTransaction({
    businessId: input.businessId,
    providerRef: init.providerRef,
    amount: input.amount,
  });
  return init;
}

/**
 * Ensure a paid SubscriptionPlan row has a NATIVE Paystack Plan (monthly). The
 * PLN_ code is created once and stored on the row; Free (₦0) plans have no
 * code. Network + platform secret required — returns an error result instead
 * of throwing so callers can surface a 502.
 */
export async function ensurePaystackPlanCode(plan: {
  id: string;
  name: string;
  displayName: string;
  monthlyPriceNaira: { toString(): string } | number;
  paystackPlanCode: string | null;
}): Promise<{ ok: true; planCode: string } | { ok: false; error: string }> {
  if (plan.name === PLAN_KEYS.free) return { ok: false, error: 'The free plan has no Paystack plan code' };
  if (plan.paystackPlanCode) return { ok: true, planCode: plan.paystackPlanCode };

  const secret = getPlatformPaystackSecret();
  if (!secret) return { ok: false, error: 'Platform Paystack is not configured' };

  const amountNaira =
    typeof plan.monthlyPriceNaira === 'number' ? plan.monthlyPriceNaira : Number(plan.monthlyPriceNaira);
  try {
    const res = await platformFetch(`${PAYSTACK_API}/plan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `SHOPORA ${plan.displayName} — monthly`,
        amount: Math.round(amountNaira * 100),
        interval: 'monthly',
        currency: 'NGN',
      }),
    });
    const data = await res.json().catch(() => null);
    const planCode = String(data?.data?.plan_code ?? '');
    if (!res.ok || !data?.status || !planCode) {
      return { ok: false, error: data?.message ?? `Paystack plan create failed (${res.status})` };
    }
    await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: { paystackPlanCode: planCode },
    });
    return { ok: true, planCode };
  } catch {
    return { ok: false, error: 'Could not reach Paystack to create subscription plan' };
  }
}

/**
 * Start a NATIVE Paystack subscription: hosted checkout with the plan code
 * attached, so the customer authorises a recurring subscription rather than a
 * one-off charge. Pre-records the initial Transaction row (reference is the
 * first charge's reference, resolvable by webhook/verify); subsequent renewals
 * carry their own Paystack-generated references and are resolved by
 * subscription_code instead.
 */
export async function initializeNativeSubscriptionCheckout(input: {
  businessId: string;
  planCode: string;
  amount: number;
  email: string;
  callbackUrl: string;
}): Promise<
  | { ok: true; providerRef: string; authorizationUrl: string }
  | { ok: false; error: string }
> {
  const secret = getPlatformPaystackSecret();
  if (!secret) return { ok: false, error: 'Platform Paystack is not configured' };

  const reference = buildSubscriptionRef();
  try {
    const res = await platformFetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(input.amount * 100),
        email: input.email,
        reference,
        callback_url: input.callbackUrl,
        plan: input.planCode,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status) {
      return { ok: false, error: data?.message ?? `Paystack initialize failed (${res.status})` };
    }
    const providerRef = String(data.data?.reference ?? reference);
    const authorizationUrl = String(data.data?.authorization_url ?? '');
    if (!authorizationUrl) return { ok: false, error: 'Paystack returned no authorization URL' };

    await recordSubscriptionTransaction({
      businessId: input.businessId,
      providerRef,
      amount: input.amount,
    });
    return { ok: true, providerRef, authorizationUrl };
  } catch {
    return { ok: false, error: 'Could not reach Paystack to start subscription' };
  }
}

/** Verify a subscription transaction server-side (never trust the redirect). */
export async function verifySubscriptionTransaction(reference: string): Promise<VerifyTransactionResult> {
  const secret = getPlatformPaystackSecret();
  if (!secret) return { status: 'unknown', amountPaid: null, providerRef: reference };
  const provider = new PaystackProvider(secret);
  return provider.verifyTransaction(reference);
}

/**
 * Charge a stored authorization code for a renewal/upgrade. Returns ok+ref
 * when Paystack accepted the charge; the caller then resolves it via the
 * webhook/verify path (single source of truth).
 */
export async function chargeAuthorization(input: {
  businessId: string;
  email: string;
  amount: number;
}): Promise<{ ok: true; providerRef: string } | { ok: false; error: string }> {
  const secret = getPlatformPaystackSecret();
  if (!secret) return { ok: false, error: 'Platform Paystack is not configured' };

  const sub = await prisma.subscription.findUnique({
    where: { businessId: input.businessId },
    select: { paystackAuthorizationCode: true },
  });
  if (!sub?.paystackAuthorizationCode) {
    return { ok: false, error: 'No saved authorization code — start a hosted checkout instead' };
  }

  try {
    const res = await platformFetch(`${PAYSTACK_API}/charge/authorization`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authorization_code: sub.paystackAuthorizationCode,
        email: input.email,
        amount: Math.round(input.amount * 100),
        reference: buildSubscriptionRef(),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.status) {
      return { ok: false, error: data?.message ?? `Paystack charge failed (${res.status})` };
    }
    const ref = String(data.data?.reference ?? '');
    if (!ref) return { ok: false, error: 'Paystack charge returned no reference' };

    await recordSubscriptionTransaction({
      businessId: input.businessId,
      providerRef: ref,
      amount: input.amount,
    });
    return { ok: true, providerRef: ref };
  } catch {
    return { ok: false, error: 'Could not reach Paystack to charge subscription' };
  }
}

/**
 * Apply a successful subscription payment (webhook / verified return).
 * Idempotent: (provider, providerRef) unique + guarded transaction. Flips the
 * Subscription (any non-active billing state) to active and extends the period
 * by one billing cycle from max(now, periodEnd). Returns 'processed'/'duplicate'.
 */
export async function applySubscriptionPaymentSuccess(input: {
  businessId: string;
  providerRef: string;
  amount: number;
  authorizationCode?: string | null;
  customerCode?: string | null;
  subscriptionCode?: string | null;
  planId?: string | null;
  billingCycle?: BillingCycle | null;
}): Promise<'processed' | 'duplicate'> {
  const { businessId, providerRef, amount } = input;

  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findFirst({
      where: { businessId, provider: PAYMENT_PROVIDERS.paystack, providerRef },
    });
    if (!txn || txn.type !== 'subscription') return 'duplicate';

    const flip = await tx.transaction.updateMany({
      where: { id: txn.id, status: 'initiated' },
      data: { status: 'success' },
    });
    if (flip.count === 0) return 'duplicate';

    if (Number(txn.amount) <= 0 && amount > 0) {
      await tx.transaction.update({ where: { id: txn.id }, data: { amount: new Prisma.Decimal(amount.toFixed(2)) } });
    }

    const sub = await tx.subscription.findUnique({ where: { businessId } });
    if (!sub) {
      throw new Error(`Subscription missing for business ${businessId}`);
    }

    const cycle: BillingCycle = input.billingCycle ?? (sub.billingCycle as BillingCycle);
    const planId = input.planId ?? sub.planId;
    const base = new Date() > sub.currentPeriodEnd ? new Date() : sub.currentPeriodEnd;
    const nextEnd = cycle === 'annual' ? addDays(base, 365) : addDays(base, 30);

    const previousStatus = sub.status;
    await tx.subscription.update({
      where: { businessId },
      data: {
        status: SUBSCRIPTION_STATUSES.active,
        planId,
        billingCycle: cycle,
        currentPeriodEnd: nextEnd,
        cancelledAt: null,
        paystackAuthorizationCode: input.authorizationCode ?? sub.paystackAuthorizationCode,
        paystackCustomerCode: input.customerCode ?? sub.paystackCustomerCode,
        paystackSubscriptionCode: input.subscriptionCode ?? sub.paystackSubscriptionCode,
      },
    });
    if (previousStatus !== SUBSCRIPTION_STATUSES.active) {
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: previousStatus,
          toStatus: SUBSCRIPTION_STATUSES.active,
          note: 'Payment received — subscription active',
        },
      });
    }
    return 'processed';
  }).then((r) => {
    if (r === 'processed') invalidateSubscriptionCache(businessId);
    return r;
  });
}

/** Map a native Paystack Plan code (PLN_…) back to the SubscriptionPlan row. */
export async function resolvePlanByPaystackCode(
  paystackPlanCode: string,
): Promise<{ id: string; name: string } | null> {
  if (!paystackPlanCode) return null;
  return prisma.subscriptionPlan.findFirst({
    where: { paystackPlanCode },
    select: { id: true, name: true },
  });
}

/**
 * Apply `subscription.create` (native Paystack). Links the native Subscription
 * code, activates the business on the plan the subscription was created under,
 * and rolls the period forward one month from max(now, periodEnd). Returns
 * 'processed'/'duplicate' (duplicate when the row was already active on the
 * same plan — webhook ledger catches replays anyway).
 */
export async function applyNativeSubscriptionCreate(input: {
  businessId: string;
  planId: string;
  subscriptionCode: string;
  customerCode?: string | null;
}): Promise<'processed' | 'duplicate' | 'noop'> {
  const { businessId } = input;
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({ where: { businessId } });
    if (!sub) throw new Error(`Subscription missing for business ${businessId}`);

    const base = new Date() > sub.currentPeriodEnd ? new Date() : sub.currentPeriodEnd;
    const nextEnd = addDays(base, 30);
    const previousStatus = sub.status;
    const planChanged = input.planId !== sub.planId;

    if (sub.status === SUBSCRIPTION_STATUSES.active && !planChanged && sub.paystackSubscriptionCode === input.subscriptionCode) {
      return 'noop'; // already exactly this active state — nothing to write
    }

    await tx.subscription.update({
      where: { businessId },
      data: {
        status: SUBSCRIPTION_STATUSES.active,
        planId: input.planId,
        billingCycle: BILLING_CYCLES.monthly,
        currentPeriodEnd: nextEnd,
        trialEndsAt: null,
        cancelledAt: null,
        paystackSubscriptionCode: input.subscriptionCode,
        paystackCustomerCode: input.customerCode ?? sub.paystackCustomerCode,
      },
    });
    if (previousStatus !== SUBSCRIPTION_STATUSES.active || planChanged) {
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: previousStatus,
          toStatus: SUBSCRIPTION_STATUSES.active,
          note: 'Native Paystack subscription created — active on paid plan',
        },
      });
    }
    return 'processed';
  }).then((r) => {
    if (r === 'processed') invalidateSubscriptionCache(businessId);
    return r;
  });
}

/**
 * Apply a native renewal/initial `charge.success` that has NO pre-recorded
 * Transaction row (Paystack-generated reference): record the subscription
 * transaction once, reactivate on the plan the charge belongs to, re-link the
 * native subscription (a late-successful retry upgrades a previously
 * downgraded business back onto the plan they paid for), and roll the period
 * forward. Idempotent via (provider, providerRef) unique + the webhook ledger.
 */
export async function applyNativeRenewalCharge(input: {
  businessId: string;
  providerRef: string;
  amount: number;
  planId: string | null;
  subscriptionCode: string;
  customerCode?: string | null;
  authorizationCode?: string | null;
}): Promise<'processed' | 'duplicate'> {
  const { businessId, providerRef, amount } = input;

  return prisma.$transaction(async (tx) => {
    try {
      await tx.transaction.create({
        data: {
          businessId,
          orderId: null,
          provider: PAYMENT_PROVIDERS.paystack,
          providerRef,
          amount: new Prisma.Decimal(Number.isFinite(amount) ? amount.toFixed(2) : '0'),
          status: 'success',
          type: 'subscription',
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
      throw err;
    }

    const sub = await tx.subscription.findUnique({
      where: { businessId },
      include: { plan: { select: { name: true } } },
    });
    if (!sub) throw new Error(`Subscription missing for business ${businessId}`);

    const base = new Date() > sub.currentPeriodEnd ? new Date() : sub.currentPeriodEnd;
    const nextEnd = addDays(base, 30);
    const previousStatus = sub.status;
    const planId = input.planId ?? sub.planId;
    const planChanged = planId !== sub.planId;

    await tx.subscription.update({
      where: { businessId },
      data: {
        status: SUBSCRIPTION_STATUSES.active,
        planId,
        billingCycle: BILLING_CYCLES.monthly,
        currentPeriodEnd: nextEnd,
        trialEndsAt: null,
        cancelledAt: null,
        paystackSubscriptionCode: input.subscriptionCode || sub.paystackSubscriptionCode,
        paystackCustomerCode: input.customerCode ?? sub.paystackCustomerCode,
        paystackAuthorizationCode: input.authorizationCode ?? sub.paystackAuthorizationCode,
      },
    });
    if (previousStatus !== SUBSCRIPTION_STATUSES.active || planChanged) {
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          fromStatus: previousStatus,
          toStatus: SUBSCRIPTION_STATUSES.active,
          note: 'Subscription charge received — active on paid plan',
        },
      });
    }
    return 'processed';
  }).then((r) => {
    if (r === 'processed') invalidateSubscriptionCache(businessId);
    return r;
  });
}

/** Resolve the amount a business owes for a given plan + cycle. */
export async function subscriptionAmountFor(
  businessId: string,
  planKey: string,
  cycle: BillingCycle,
): Promise<number | null> {
  void businessId;
  const plan = await prisma.subscriptionPlan.findUnique({ where: { name: planKey } });
  if (!plan || !plan.isActive) return null;
  return priceForCycle(
    { monthlyPriceNaira: Number(plan.monthlyPriceNaira), annualPriceNaira: Number(plan.annualPriceNaira) },
    cycle === 'annual' ? BILLING_CYCLES.annual : BILLING_CYCLES.monthly,
  );
}