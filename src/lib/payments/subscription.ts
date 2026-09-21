// SHOPORA subscription billing — Paystack operations collected on the
// PLATFORM's Paystack account (the store owner is SHOPORA's customer here;
// their own connected Paystack still handles store checkout). Nothing here
// touches order-payment logic.
//
// Flow:
//   1. initializeSubscriptionCheckout → first payment, hosted checkout page.
//      The captured authorization code is stored so renewals can charge it.
//   2. chargeAuthorization → renewal/upgrade on a stored authorization code
//      (no customer interaction). Falls back to a fresh hosted checkout when
//      the code is missing/no longer valid.
//   3. Webhook charge.success for a subscription transaction (providerRef
//      prefix SP-SUB-) → applySubscriptionPaymentSuccess (idempotent).

const PAYSTACK_API = 'https://api.paystack.co';
const TIMEOUT_MS = 15000;
const SUB_REF_PREFIX = 'SP-SUB-';

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PaystackProvider } from './paystack';
import { PAYMENT_PROVIDERS, type VerifyTransactionResult } from './types';
import { addDays, BILLING_CYCLES, priceForCycle, SUBSCRIPTION_STATUSES, type BillingCycle } from '@/lib/subscriptions/plans';
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