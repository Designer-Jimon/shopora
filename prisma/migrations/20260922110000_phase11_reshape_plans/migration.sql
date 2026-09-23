-- Phase 11 data migration: reshape the three CORE plan rows in place to the
-- repurposed catalogue (starter->Free, business->Starter, premium->Growth).
--
-- ensurePlansSeeded is create-only (Phase 10 rule: never clobber admin edits),
-- so the catalogue repurpose (starter ₦5000, business ₦15000, premium ₦35000,
-- orderLimit 50, removeBranding false -> Free ₦0, Starter ₦10k, Growth ₦25k)
-- must be delivered as a one-time data migration. paystackPlanCode is preserved
-- untouched so existing Paystack links keep working.

-- Free (repurposed 'starter' row): ₦0, 20 products, 1 staff, 50 orders, no
-- custom domain, SHOPORA-branded, basic analytics.
UPDATE "SubscriptionPlan"
SET
  "displayName"       = 'Free',
  "description"       = 'Start selling — your store stays live forever for free.',
  "monthlyPriceNaira" = 0,
  "annualPriceNaira"  = 0,
  "productLimit"      = 20,
  "staffLimit"        = 1,
  "orderLimit"        = 50,
  "customDomain"      = false,
  "removeBranding"    = false,
  "analyticsTier"     = 'basic',
  "sortOrder"         = 1
WHERE "name" = 'starter';

-- Starter (repurposed 'business' row): ₦10,000/mo, 200 products, 10 staff,
-- 500 orders, custom domain, branding removed, advanced analytics.
UPDATE "SubscriptionPlan"
SET
  "displayName"       = 'Starter',
  "description"       = 'For growing stores. More products, no SHOPORA branding, and a custom domain.',
  "monthlyPriceNaira" = 10000,
  "annualPriceNaira"  = 100000,
  "productLimit"      = 200,
  "staffLimit"        = 10,
  "orderLimit"        = 500,
  "customDomain"      = true,
  "removeBranding"    = true,
  "analyticsTier"     = 'advanced',
  "sortOrder"         = 2
WHERE "name" = 'business';

-- Growth (repurposed 'premium' row): ₦25,000/mo, unlimited everything,
-- branding removed, priority support.
UPDATE "SubscriptionPlan"
SET
  "displayName"       = 'Growth',
  "description"       = 'For established stores. Unlimited everything, advanced analytics and priority support.',
  "monthlyPriceNaira" = 25000,
  "annualPriceNaira"  = 250000,
  "productLimit"      = 999999,
  "staffLimit"        = 100,
  "orderLimit"        = 999999,
  "customDomain"      = true,
  "removeBranding"    = true,
  "analyticsTier"     = 'advanced',
  "sortOrder"         = 3
WHERE "name" = 'premium';

-- Drop leftover throwaway plans created by earlier phase verification scripts
-- (p9-micro and any p11-* temp rows). These use reserved scratch prefixes and
-- are never part of the production catalogue.
--
-- NOTE: we SOFT-deactivate rather than DELETE. Leftover scratch Subscription
-- rows from earlier interrupted verification runs still RESTRICT-reference
-- these plan rows (Subscription_planId_fkey), so a hard delete would fail the
-- migration. Because the GET catalogue (and ensurePlansSeeded idempotency)
-- both filter isActive = true, deactivating shrinks the visible catalogue to
-- the three core rows while keeping FK integrity intact. Admin can hard-delete
-- later from /admin/subscriptions/plans when nothing references them.
UPDATE "SubscriptionPlan"
SET "isActive" = false
WHERE "name" LIKE 'p9-%'
   OR "name" LIKE 'p10-%'
   OR "name" LIKE 'p11-%';
