// SHOPORA subscription downgrade — Phase 11. The ONLY way a row leaves a
// trial / legacy-billing state is a SOFT-DOWNGRADE to the Free plan (status
// active). No account deletion and no storefront lockout: the Free plan's
// limits (products, staff, monthly orders, branding) simply take over.
//
// Deliberate scope line (keeps Phase 10 moderation semantics intact):
//   * trial          overdue  → downgrade (on-touch AND daily cron)
//   * active+paid    lapsed with no native Paystack sub → downgrade
//   * past_due       (legacy grace state) elapsed → downgrade
//   * suspended      is Phase 10 MODERATION — never auto-recovered here
//   * cancelled      legacy terminal state — left as-is (never produced by the
//     Phase 11 flows: trial and paid rows converge to active-on-Free instead)
//
// Paystack billing events (`invoice.payment_failed`, `subscription.disable`)
// also call downgradeToFree directly from the webhook.

import prisma from '@/lib/prisma';
import {
  addDays,
  FREE_PERIOD_DAYS,
  PLAN_KEYS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from './plans';
import { invalidateSubscriptionCache } from './state';

export type DowngradeCandidate = {
  id?: string;
  businessId: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date;
  paystackSubscriptionCode: string | null;
  plan: { name: string } | null;
};

/**
 * Decide whether a subscription row should soft-downgrade to the Free plan
 * right now, and why. Shared by checkSubscription (on-touch) and the daily
 * billing job (cron) so both stay consistent. Returns null when the row stays.
 */
export function pendingDowngradeReason(sub: DowngradeCandidate, now: Date): string | null {
  if (sub.status === SUBSCRIPTION_STATUSES.trial) {
    if (sub.trialEndsAt && now >= sub.trialEndsAt) return 'Free trial ended';
    return null;
  }

  if (sub.status === SUBSCRIPTION_STATUSES.active) {
    if (sub.plan?.name === PLAN_KEYS.free) return null; // Free never lapses
    if (sub.currentPeriodEnd >= now) return null;
    if (sub.paystackSubscriptionCode) return null; // Paystack owns renewals
    return 'Renewal not received — moved to the free plan';
  }

  if (sub.status === SUBSCRIPTION_STATUSES.pastDue && sub.currentPeriodEnd < now) {
    return 'Payment grace period elapsed — moved to the free plan';
  }

  // suspended (moderation) / cancelled (legacy terminal) → leave alone.
  return null;
}

/**
 * Soft-downgrade a business to the Free plan. Idempotent: no-op when it is
 * already active on Free. Writes a SubscriptionHistory note and clears the
 * native Paystack subscription link. Returns 'downgraded' | 'noop'.
 */
export async function downgradeToFree(businessId: string, reason: string): Promise<'downgraded' | 'noop'> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { businessId },
      include: { plan: { select: { name: true } } },
    });
    if (!sub) return 'noop';
    if (sub.status === SUBSCRIPTION_STATUSES.active && sub.plan.name === PLAN_KEYS.free) return 'noop';

    const freePlan = await tx.subscriptionPlan.findUnique({ where: { name: PLAN_KEYS.free } });
    if (!freePlan) throw new Error('Free plan not found — cannot downgrade');

    const previousStatus = sub.status as SubscriptionStatus;
    const now = new Date();
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        planId: freePlan.id,
        status: SUBSCRIPTION_STATUSES.active,
        billingCycle: 'monthly',
        trialEndsAt: null,
        currentPeriodEnd: addDays(now, FREE_PERIOD_DAYS),
        cancelledAt: null,
        paystackSubscriptionCode: null,
      },
    });
    await tx.subscriptionHistory.create({
      data: {
        subscriptionId: sub.id,
        fromStatus: previousStatus,
        toStatus: SUBSCRIPTION_STATUSES.active,
        note: `Downgraded to the free plan — ${reason}`,
      },
    });
    return 'downgraded';
  }).then((r) => {
    if (r === 'downgraded') invalidateSubscriptionCache(businessId);
    return r;
  });
}