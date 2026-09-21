// SHOPORA subscription state — the single source of truth for a business's
// subscription. Every enforcement point (dashboard load, storefront layout,
// checkout API, product/staff limits) goes through getSubscriptionState():
//
//   ensurePlansSeeded() → ensureSubscription(businessId) → checkSubscription()
//   → read the row → cache the snapshot in-process for TTL.
//
// The cache means a busy storefront costs ~1 DB round per 30s per process
// instead of one per pageview, and checkSubscription (which can write status
// flips) only ever runs on a cache miss. Flips are forward-only and guarded by
// updateMany, so concurrent misses are harmless.
//
// Statuses: trial → past_due → suspended → cancelled; active stays until its
// period end then goes past_due. See Subscription model comment in the schema.

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  addDays,
  BILLING_CYCLES,
  ensurePlansSeeded,
  GRACE_DAYS,
  PLAN_KEYS,
  SUBSCRIPTION_STATE_TTL_MS,
  SUBSCRIPTION_STATUSES,
  SUSPEND_DAYS,
  TRIAL_DAYS,
  type BillingCycle,
  type SubscriptionStatus,
} from './plans';

export type SubscriptionState = {
  businessId: string;
  status: SubscriptionStatus;
  planKey: string;
  planDisplayName: string;
  productLimit: number;
  staffLimit: number;
  customDomain: boolean;
  analyticsTier: string;
  billingCycle: BillingCycle;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  cancelledAt: Date | null;
  hasAuthorizationCode: boolean;
};

const stateCache = new Map<string, { state: SubscriptionState; expiresAt: number }>();

/** Drop a cached snapshot (used after webhook/checkout flips to reactive). */
export function invalidateSubscriptionCache(businessId: string): void {
  stateCache.delete(businessId);
}

/**
 * Provision the business's trial subscription lazily (first call on any
 * entry point). Idempotent under concurrency thanks to the @unique businessId.
 */
export async function ensureSubscription(businessId: string): Promise<void> {
  const existing = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true },
  });
  if (existing) return;

  await ensurePlansSeeded();
  const starter = await prisma.subscriptionPlan.findUnique({ where: { name: PLAN_KEYS.starter } });
  if (!starter) {
    throw new Error(`Starter plan not found — cannot provision trial for ${businessId}`);
  }

  const now = new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS);
  try {
    await prisma.subscription.create({
      data: {
        businessId,
        planId: starter.id,
        billingCycle: BILLING_CYCLES.monthly,
        status: SUBSCRIPTION_STATUSES.trial,
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
        history: {
          create: { fromStatus: null, toStatus: SUBSCRIPTION_STATUSES.trial, note: 'Free trial started' },
        },
      },
    });
  } catch (err) {
    // Unique violation on businessId → another request provisioned it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  invalidateSubscriptionCache(businessId);
}

/**
 * Advance the state machine by calendar time. Forward-only; only flips when a
 * deadline has passed, inside a guarded transaction so concurrent flippers
 * can't double-write history. No-op for businesses far from a deadline beyond
 * a single indexed read (the row is already in the cache path's hot set).
 */
export async function checkSubscription(businessId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    select: { id: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
  });
  if (!sub) return;

  const now = new Date();
  let next:
    | { status: SubscriptionStatus; currentPeriodEnd: Date; cancelledAt?: Date; note: string }
    | null = null;

  if (sub.status === SUBSCRIPTION_STATUSES.trial && sub.trialEndsAt && now >= sub.trialEndsAt) {
    next = {
      status: SUBSCRIPTION_STATUSES.pastDue,
      currentPeriodEnd: addDays(now, GRACE_DAYS),
      note: 'Free trial ended — payment grace period started',
    };
  } else if (sub.status === SUBSCRIPTION_STATUSES.active && now >= sub.currentPeriodEnd) {
    next = {
      status: SUBSCRIPTION_STATUSES.pastDue,
      currentPeriodEnd: addDays(now, GRACE_DAYS),
      note: 'Billing period ended — renewal grace period started',
    };
  } else if (sub.status === SUBSCRIPTION_STATUSES.pastDue && now >= sub.currentPeriodEnd) {
    next = {
      status: SUBSCRIPTION_STATUSES.suspended,
      currentPeriodEnd: addDays(now, SUSPEND_DAYS),
      note: 'Grace period elapsed — subscription suspended',
    };
  } else if (sub.status === SUBSCRIPTION_STATUSES.suspended && now >= sub.currentPeriodEnd) {
    next = {
      status: SUBSCRIPTION_STATUSES.cancelled,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelledAt: now,
      note: 'Suspension period elapsed — subscription cancelled',
    };
  }
  if (!next) return;

  await prisma.$transaction(async (tx) => {
    const flipped = await tx.subscription.updateMany({
      where: { id: sub.id, status: sub.status },
      data: {
        status: next!.status,
        currentPeriodEnd: next!.currentPeriodEnd,
        cancelledAt: next!.cancelledAt ?? null,
      },
    });
    if (flipped.count === 0) return; // another flipper won — keep their history
    await tx.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: sub.status,
        toStatus: next!.status,
        note: next!.note,
      },
    });
  });

  invalidateSubscriptionCache(businessId);
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
    customDomain: sub.plan.customDomain,
    analyticsTier: sub.plan.analyticsTier,
    billingCycle: sub.billingCycle as BillingCycle,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelledAt: sub.cancelledAt,
    hasAuthorizationCode: !!sub.paystackAuthorizationCode,
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