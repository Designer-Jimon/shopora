// SHOPORA subscription plan catalogue — Phase 9, repurposed for Phase 11.
//
// Names are STABLE plan row keys (never renamed — history and admin edits key
// off them); displayName/prices/limits are what the store owner sees and are
// admin-managed after Phase 10. Deliberate mapping (keeps existing rows and
// SubscriptionHistory intact):
//   PLAN_KEYS.free    → name 'starter'   → display "Free"   ₦0/mo
//   PLAN_KEYS.starter → name 'business'  → display "Starter" ₦10k/mo
//   PLAN_KEYS.growth  → name 'premium'   → display "Growth"  ₦25k/mo
//
// ensurePlansSeeded upserts the catalogue idempotently so any server process
// (migration, seed script, or on-demand bootstrap) produces the same rows.
// Prices in Phase 11 are PLACEHOLDERS the platform owner edits from
// /admin/subscriptions/plans (per the Phase 11 scope decision).

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

/**
 * Semantic plan keys → DB row names. `free` is what every business rolls back
 * to on downgrade; `starter` is the paid entry plan a 14-day trial runs on;
 * `growth` is the top tier.
 */
export const PLAN_KEYS = {
  free: 'starter',
  starter: 'business',
  growth: 'premium',
} as const;
export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS];

/** Sentinel for "effectively unlimited" numeric limits. */
export const LIMIT_UNLIMITED = 999999;

// Lifecycle constants (see schema Comment for the state machine).
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 7;
export const SUSPEND_DAYS = 7;
/** How many calendar days a downgraded row's period rolls forward (stats only). */
export const FREE_PERIOD_DAYS = 30;
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
  orderLimit: number;
  customDomain: boolean;
  removeBranding: boolean;
  analyticsTier: string;
  sortOrder: number;
};

export const SEED_PLANS: SeedPlan[] = [
  {
    key: PLAN_KEYS.free,
    displayName: 'Free',
    description: 'Start selling — your store stays live forever for free.',
    monthlyPriceNaira: 0,
    annualPriceNaira: 0,
    productLimit: 20,
    staffLimit: 1,
    orderLimit: 50,
    customDomain: false,
    removeBranding: false,
    analyticsTier: 'basic',
    sortOrder: 1,
  },
  {
    key: PLAN_KEYS.starter,
    displayName: 'Starter',
    description: 'For growing stores. More products, no SHOPORA branding, and a custom domain.',
    monthlyPriceNaira: 10000,
    annualPriceNaira: 100000,
    productLimit: 200,
    staffLimit: 10,
    orderLimit: 500,
    customDomain: true,
    removeBranding: true,
    analyticsTier: 'advanced',
    sortOrder: 2,
  },
  {
    key: PLAN_KEYS.growth,
    displayName: 'Growth',
    description: 'For established stores. Unlimited everything, advanced analytics and priority support.',
    monthlyPriceNaira: 25000,
    annualPriceNaira: 250000,
    productLimit: LIMIT_UNLIMITED,
    staffLimit: 100,
    orderLimit: LIMIT_UNLIMITED,
    customDomain: true,
    removeBranding: true,
    analyticsTier: 'advanced',
    sortOrder: 3,
  },
];

export function isFreePlan(plan: { name: string }): boolean {
  return plan.name === PLAN_KEYS.free;
}

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
          orderLimit: p.orderLimit,
          customDomain: p.customDomain,
          removeBranding: p.removeBranding,
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