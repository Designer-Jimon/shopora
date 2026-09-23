// SHOPORA daily billing job — Phase 11. Shared by the `/api/cron/billing`
// endpoint (token-guarded, hosted) and the `billing:daily` npm script
// (standalone, run by whatever scheduler the owner picks). Both converge every
// overdue trial / lapsed paid / elapsed legacy-grace row onto the Free plan.

import prisma from '@/lib/prisma';
import { downgradeToFree, pendingDowngradeReason } from './downgrade';
import { ensurePlansSeeded } from './plans';

export type BillingDowngradeResult = {
  checked: number;
  downgraded: number;
  reasons: { businessId: string; reason: string }[];
};

/** Scan every subscription and soft-downgrade those whose time is up. */
export async function runBillingDowngrades(): Promise<BillingDowngradeResult> {
  await ensurePlansSeeded();
  const now = new Date();

  const subs = await prisma.subscription.findMany({
    select: {
      businessId: true,
      status: true,
      plan: { select: { name: true } },
      trialEndsAt: true,
      currentPeriodEnd: true,
      paystackSubscriptionCode: true,
    },
  });

  const reasons: { businessId: string; reason: string }[] = [];
  for (const sub of subs) {
    const reason = pendingDowngradeReason(sub, now);
    if (!reason) continue;
    const outcome = await downgradeToFree(sub.businessId, reason);
    if (outcome === 'downgraded') reasons.push({ businessId: sub.businessId, reason });
  }

  return { checked: subs.length, downgraded: reasons.length, reasons };
}