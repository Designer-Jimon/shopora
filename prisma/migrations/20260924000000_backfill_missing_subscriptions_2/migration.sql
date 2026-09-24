-- SHOPORA — Backfill #2: give every business still missing a Subscription row
-- a fresh 14-day paid-Starter trial + SubscriptionHistory entry.
--
-- Root cause (verified against the live DB, 2026-09-24):
--   Subscriptions were created ONLY lazily (getSubscriptionState → first
--   dashboard/storefront/checkout touch). Five businesses had no Subscription:
--     • Phase9 Store (created 2026-09-19) — its Phase-9-era trial row sat on a
--       p9-* scratch plan and was dropped as collateral by Phase-11 test-plan
--       teardown (verify-subscription cleanup deletes subscriptions whose plan
--       name starts with p9-).
--     • Ada Oak Store (x2), Auth E2E, Rate Limit Biz (created 2026-09-22/23,
--       after backfill #1) — created post-backfill and never "touched", so the
--       lazy provisioner never fired.
--   The permanent fix (eager provisioning at business creation, inside the
--   register transaction) ships in the same release via
--   src/lib/subscriptions/state.ts + src/app/api/auth/register/route.ts.
--
--   This migration heals only the CURRENT missing rows. Idempotent and safe on
--   any environment (a no-op when nothing is missing):
--     * only touches businesses that have NO subscription yet,
--     * skips silently if the paid Starter plan ('business') isn't seeded,
--     * provisions the trial the same way createTrialRow() does, keyed off the
--       reshaped paid Starter row (name = 'business').
--   md5() is used instead of gen_random_uuid() so it works on PG < 13 too.

WITH starter AS (
  SELECT "id" FROM "SubscriptionPlan" WHERE "name" = 'business'
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
       'Backfilled 14-day trial for business missing a subscription (eager-provisioning fix)', now()
FROM newly n;