// SHOPORA subscription state — the single source of truth for a business's
// subscription. Every enforcement point (dashboard load, storefront layout,
// checkout API, product/staff/order limits) goes through getSubscriptionState():
//
//   ensurePlansSeeded() → ensureSubscription(businessId) → checkSubscription()
//   → read the row → cache the snapshot in-process for TTL.
//
// The cache means a busy storefront costs ~1 DB round per 30s per process
// instead of one per pageview, and checkSubscription (which can downgrade on
// calendar time) only ever runs on a cache miss. Downgrades are guarded by
// downgradeToFree (transactional, unique businessId), so concurrent misses are
// harmless.
//
// Phase 11 lifecycle (see schema Comment): new businesses get a 14-day trial
// on the PAID Starter plan; overdue trials (and lapsed paid rows with no native
// Paystack subscription) SOFT-DOWNGRADE to active on the Free plan. Past
// states past_due/suspended/cancelled only survive as legacy rows; suspended is
// Phase 10 moderation and is never auto-recovered here.

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  addDays,
  BILLING_CYCLES,
  ensurePlansSeeded,
  PLAN_KEYS,
  SUBSCRIPTION_STATE_TTL_MS,
  SUBSCRIPTION_STATUSES,
  TRIAL_DAYS,
  type BillingCycle,
  type SubscriptionStatus,
} from './plans';
import { downgradeToFree, pendingDowngradeReason } from './downgrade';

export type SubscriptionState = {
  businessId: string;
  status: SubscriptionStatus;
  planKey: string;
  planDisplayName: string;
  productLimit: number;
  staffLimit: number;
  orderLimit: number;
  customDomain: boolean;
  removeBranding: boolean;
  analyticsTier: string;
  onFreePlan: boolean;
  billingCycle: BillingCycle;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  hasAuthorizationCode: boolean;
  hasNativeSubscription: boolean;
};

const stateCache = new Map<string, { state: SubscriptionState; expiresAt: number }>();

/** Drop a cached snapshot (used after webhook/checkout flips to reactive). */
export function invalidateSubscriptionCache(businessId: string): void {
  stateCache.delete(businessId);
}

/**
 * Create the trial Subscription row (+ SubscriptionHistory entry) inside an
 * EXISTING transaction/transaction-client. Shared by both provisioning paths:
 *   • provisionTrialAtCreation — eager, fired when a Business row is created
 *     (primary mechanism — see src/app/api/auth/register/route.ts)
 *   • ensureSubscription       — lazy defensive fallback (first touch)
 * P2002 (businessId already provisioned) is swallowed by callers.
 */
async function createTrialRow(
  tx: Prisma.TransactionClient,
  businessId: string,
  note: string,
): Promise<void> {
  const trialPlan = await tx.subscriptionPlan.findUnique({ where: { name: PLAN_KEYS.starter } });
  if (!trialPlan) {
    throw new Error(`Starting plan not found — cannot provision trial for ${businessId}`);
  }

  const now = new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS);
  await tx.subscription.create({
    data: {
      businessId,
      planId: trialPlan.id,
      billingCycle: BILLING_CYCLES.monthly,
      status: SUBSCRIPTION_STATUSES.trial,
      trialEndsAt,
      currentPeriodEnd: trialEndsAt,
      history: {
        create: { fromStatus: null, toStatus: SUBSCRIPTION_STATUSES.trial, note },
      },
    },
  });
}

/**
 * Eager (PRIMARY) provisioning — called inside the same transaction that
 * creates a new Business during registration. Ensures a brand-new business
 * has a 14-day paid-Starter trial row the INSTANT its Business row exists,
 * never relying on a later dashboard/storefront "touch". Idempotent: a P2002
 * on businessId (racing registration retries) returns false and leaves the
 * existing row alone.
 */
export async function provisionTrialAtCreation(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<boolean> {
  await ensurePlansSeeded();
  try {
    await createTrialRow(tx, businessId, 'Paid-plan trial started at business creation');
    invalidateSubscriptionCache(businessId);
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}

/**
 * Provision the business's subscription lazily (DEFENSIVE FALLBACK — first
 * call on any entry point): a 14-day TRIAL on the PAID Starter plan.
 * Idempotent under concurrency thanks to the @unique businessId.
 * New businesses are expected to be provisioned eagerly by
 * provisionTrialAtCreation; this only covers rows created outside the
 * registration path (seed/verification scripts, pre-Phase-11 legacy rows).
 */
export async function ensureSubscription(businessId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true },
  });
  if (existing) return;

  await ensurePlansSeeded();
  try {
    await createTrialRow(prisma, businessId, 'Paid-plan trial started');
  } catch (err) {
    // Unique violation on businessId → another request provisioned it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  invalidateSubscriptionCache(businessId);
}

/**
 * Advance the state machine by calendar time (on-touch mirror of the daily
 * job). Overdue trials and lapsed paid rows downgrade to active-on-Free via
 * the shared pendingDowngradeReason/downgradeToFree pair. No-op for live rows.
 */
export async function checkSubscription(businessId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: {
      businessId: true,
      status: true,
      plan: { select: { name: true } },
      trialEndsAt: true,
      currentPeriodEnd: true,
      paystackSubscriptionCode: true,
    },
  });
  if (!sub) return;

  const reason = pendingDowngradeReason(sub, new Date());
  if (reason) await downgradeToFree(sub.businessId, reason);
}

async function loadState(businessId: string): Promise<SubscriptionState> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true },
  });
  if (!sub) throw new Error(`Subscription missing for business ${businessId}`);
  return {
    businessId,
    status: sub.status as SubscriptionStatus,
    planKey: sub.plan.name,
    planDisplayName: sub.plan.displayName,
    productLimit: sub.plan.productLimit,
    staffLimit: sub.plan.staffLimit,
    orderLimit: sub.plan.orderLimit,
    customDomain: sub.plan.customDomain,
    removeBranding: sub.plan.removeBranding,
    analyticsTier: sub.plan.analyticsTier,
    onFreePlan: sub.plan.name === PLAN_KEYS.free,
    billingCycle: sub.billingCycle as BillingCycle,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelledAt: sub.cancelledAt,
    hasAuthorizationCode: !!sub.paystackAuthorizationCode,
    hasNativeSubscription: !!sub.paystackSubscriptionCode,
  };
}

/**
 * Resolve (and lazily provision/advance) a business's subscription state.
 * TTL-cached in-process so repeated reads don't hit the database.
 */
export async function getSubscriptionState(businessId: string): Promise<SubscriptionState> {
  const hit = stateCache.get(businessId);
  if (hit && hit.expiresAt > Date.now()) return hit.state;

  await ensurePlansSeeded();
  await ensureSubscription(businessId);
  await checkSubscription(businessId);

  const state = await loadState(businessId);
  stateCache.set(businessId, { state, expiresAt: Date.now() + SUBSCRIPTION_STATE_TTL_MS });
  return state;
}

/** True when the business may still transact on the checkout path. */
export function isCheckoutAllowed(status: SubscriptionStatus): boolean {
  return status === SUBSCRIPTION_STATUSES.trial || status === SUBSCRIPTION_STATUSES.active || status === SUBSCRIPTION_STATUSES.pastDue;
}

/** Start of the current calendar month (used for the monthly order cap). */
export function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Count of orders placed this calendar month (drives the orderLimit cap). */
export async function ordersThisMonth(businessId: string, now: Date = new Date()): Promise<number> {
  return prisma.order.count({
    where: { businessId, createdAt: { gte: monthStart(now) } },
  });
}