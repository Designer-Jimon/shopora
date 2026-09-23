-- Phase 11: Paystack native subscriptions + soft downgrade to Free.
--
-- 1. SubscriptionPlan: native Paystack plan code, monthly order cap, branding
--    toggle.
-- 2. Subscription: native Paystack Subscription code (cleared on downgrade).
-- 3. WebhookEvent: idempotency ledger (unique event+eventId).
-- 4. Align existing backfilled `trial` rows (provisioned on the old 'starter'
--    plan, which Phase 11 renames to the FREE tier) onto the PAID Starter plan
--    ('business'), so a trial always reads as a paid-plan trial and the Free
--    row is reserved for grew-downgraded / never-paid businesses. Metadata
--    only — no charge, no limit change; the daily job downgrades these to Free
--    when their trial lapse.

ALTER TABLE "SubscriptionPlan"
  ADD COLUMN "paystackPlanCode" TEXT,
  ADD COLUMN "orderLimit" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "removeBranding" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Subscription"
  ADD COLUMN "paystackSubscriptionCode" TEXT;

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'paystack',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_event_eventId_key" ON "WebhookEvent"("event", "eventId");
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- Move trial rows off the (now-Free) 'starter' plan onto paid 'business'.
UPDATE "Subscription" AS s
SET "planId" = paid."id"
FROM "SubscriptionPlan" AS free, "SubscriptionPlan" AS paid
WHERE s."planId" = free."id"
  AND free."name" = 'starter'
  AND paid."name" = 'business'
  AND s."status" = 'trial';