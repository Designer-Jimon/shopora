-- SHOPORA — Backfill: give every Business a Subscription row.
--
-- Root cause (verified against the live DB):
--   Businesses created before Phase 9 (subscription billing) predate the lazy
--   trial-provisioning in getSubscriptionState() (src/lib/subscriptions/state.ts),
--   which only creates a Subscription row on a business's FIRST post-Phase-9
--   touch (dashboard/storefront load, checkout, etc.). Ifeco Pastries — created
--   during Phase 3/4 testing — had never been touched since Phase 9 was shipped,
--   so it had ZERO Subscription rows. Lists derived from the Subscription table
--   (the Super Admin "Subscriptions" ledger, MRR/status counts, revenue views)
--   therefore silently omitted it and every other pre-Phase-9 business.
--
--   A deterministic scan found 22/25 businesses with no Subscription row.
--   This migration provisions a fresh 14-day Starter trial for each of them,
--   exactly as getSubscriptionState() would have if they'd been touched today,
--   and records a SubscriptionHistory row so the trial start is auditable.
--
--   Safe to run on any environment:
--     * only touches businesses that have NO subscription yet,
--     * skips silently if the Starter plan isn't seeded yet (runtime
--       ensurePlansSeeded() seeds it before any trial provisioning path runs),
--     * a no-op on a fresh DB (no businesses exist at migration time).
--   md5() is used instead of gen_random_uuid() so it works on PG < 13 too.

WITH starter AS (
  SELECT "id" FROM "SubscriptionPlan" WHERE "name" = 'starter'
),
newly AS (
  INSERT INTO "Subscription"
    ("id", "businessId", "planId", "billingCycle", "status",
     "trialEndsAt", "currentPeriodEnd", "createdAt", "updatedAt")
  SELECT md5(random()::text || clock_timestamp()::text),
         b."id", s."id", 'monthly', 'trial',
         now() + interval '14 days', now() + interval '14 days', now(), now()
  FROM "Business" b
  CROSS JOIN starter s
  WHERE NOT EXISTS (
    SELECT 1 FROM "Subscription" x WHERE x."businessId" = b."id"
  )
  RETURNING "id"
)
INSERT INTO "SubscriptionHistory"
  ("id", "subscriptionId", "fromStatus", "toStatus", "note", "changedAt")
SELECT md5(random()::text || clock_timestamp()::text),
       n."id", NULL, 'trial',
       'Backfilled 14-day trial for pre-Phase-9 business', now()
FROM newly n;