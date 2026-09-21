// SHOPORA subscription plan catalogue — Phase 9.
// Names are the stable plan keys; displayName is what users see. Prices are
// NGN. ensurePlansSeeded upserts the catalogue idempotently so any server
// process (migration, seed script, or on-demand bootstrap) produces the same
// rows.

import prisma from '@/lib/prisma';

export const SUBSCRIPTION_STATUSES = {
  trial: 'trial',
  active: 'active',
  pastDue: 'past_due',
  suspended: 'suspended',
  cancelled: 'cancelled',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

export const BILLING_CYCLES = {
  monthly: 'monthly',
  annual: 'annual',
} as const;
export type BillingCycle = (typeof BILLING_CYCLES)[keyof typeof BILLING_CYCLES];

export const PLAN_KEYS = {
  starter: 'starter',
  business: 'business',
  premium: 'premium',
} as const;
export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS];

// Lifecycle constants (see schema Comment for the state machine).
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
export const SUSPEND_DAYS = 7;
/** How long an in-process state snapshot is reused before re-checking. */
export const SUBSCRIPTION_STATE_TTL_MS = (() => {
  const raw = parseInt(process.env.SUBSCRIPTION_STATE_TTL_MS ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
})();

export type SeedPlan = {
  key: string;
  displayName: string;
  description: string;
  monthlyPriceNaira: number;
  annualPriceNaira: number;
  productLimit: number;
  staffLimit: number;
  customDomain: boolean;
  analyticsTier: string;
  sortOrder: number;
};

export const SEED_PLANS: SeedPlan[] = [
  {
    key: PLAN_KEYS.starter,
    displayName: 'Starter',
    description: 'For first-time sellers. Everything you need to list and sell your first products.',
    monthlyPriceNaira: 5000,
    annualPriceNaira: 50000,
    productLimit: 50,
    staffLimit: 2,
    customDomain: false,
    analyticsTier: 'basic',
    sortOrder: 1,
  },
  {
    key: PLAN_KEYS.business,
    displayName: 'Business',
    description: 'For growing stores. More products, more staff, and a custom domain.',
    monthlyPriceNaira: 15000,
    annualPriceNaira: 150000,
    productLimit: 200,
    staffLimit: 10,
    customDomain: true,
    analyticsTier: 'advanced',
    sortOrder: 2,
  },
  {
    key: PLAN_KEYS.premium,
    displayName: 'Premium',
    description: 'For established stores. Top limits, custom domains, advanced analytics and priority support.',
    monthlyPriceNaira: 35000,
    annualPriceNaira: 350000,
    productLimit: 1000,
    staffLimit: 50,
    customDomain: true,
    analyticsTier: 'advanced',
    sortOrder: 3,
  },
];

export function priceForCycle(plan: { monthlyPriceNaira: number; annualPriceNaira: number }, cycle: BillingCycle): number {
  return cycle === 'annual' ? Number(plan.annualPriceNaira) : Number(plan.monthlyPriceNaira);
}

export function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(amount)}`;
}

let plansSeededPromise: Promise<void> | null = null;

/**
 * Upsert the plan catalogue. Idempotent and cheap (3 upserts), run once per
 * process and on-demand from ensureSubscription so a deployment works without
 * any manual seed step.
 *
 * Phase 10: the `update` branch is deliberately EMPTY — once a plan exists its
 * editable fields (price, limits, displayName, isActive, sortOrder) belong to
 * the platform admins editing it from /admin/subscriptions/plans. Seeding only
 * ever CREATES missing catalogue rows; it never clobbers admin edits.
 */
export async function ensurePlansSeeded(): Promise<void> {
  if (plansSeededPromise) return plansSeededPromise;
  plansSeededPromise = (async () => {
    for (const p of SEED_PLANS) {
      await prisma.subscriptionPlan.upsert({
        where: { name: p.key },
        update: {}, // admin-managed from Phase 10 — do not overwrite
        create: {
          name: p.key,
          displayName: p.displayName,
          description: p.description,
          monthlyPriceNaira: p.monthlyPriceNaira,
          annualPriceNaira: p.annualPriceNaira,
          productLimit: p.productLimit,
          staffLimit: p.staffLimit,
          customDomain: p.customDomain,
          analyticsTier: p.analyticsTier,
          isActive: true,
          sortOrder: p.sortOrder,
        },
      });
    }
  })();
  try {
    await plansSeededPromise;
  } finally {
    plansSeededPromise = null; // allow retry if a later upsert failed
  }
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}