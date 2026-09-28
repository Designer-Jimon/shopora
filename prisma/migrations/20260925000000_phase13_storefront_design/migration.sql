-- SHOPORA — Phase 13: Storefront Design Studio (~Part 1).
--
-- New tenant-scoped table for merchant-authored storefront cover/hero designs.
-- A design is a STRUCTURED JSON document (canvas configuration + element list),
-- not a rendered HTML blob. Every row points at exactly one Business with
-- ON DELETE CASCADE; the design routes authorize every read/write against the
-- verified session businessId (`{ id, businessId }` scoping), so Merchant A can
-- never reach Merchant B's designs — the model itself cannot leak across
-- tenants.
--
-- Part 2 (responsive preview + publish flow) fields are created now so that
-- phase can ship without a disruptive schema change:
--   status      → 'draft' (default) | 'published'
--   publishedAt → set on first publish
--   metadata    → reserved JSON for responsive/safe-zone config
--   elements[*].responsive → per-element breakpoint config (lives inside the
--                           elements JSONB — no column needed)
--
-- SHOPORA_DESIGN_DOC note: `canvas` and `elements` are JSONB (validated +
-- sanitized by src/lib/storefront-design/types.ts on every read/write; the
-- editor round-trips them as opaque-but-structured objects, never as HTML).

CREATE TABLE "StorefrontDesign" (
    "id"          TEXT        NOT NULL,
    "businessId"  TEXT        NOT NULL,
    "name"        TEXT        NOT NULL DEFAULT 'Untitled design',
    "status"      TEXT        NOT NULL DEFAULT 'draft',
    "canvas"      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    "elements"    JSONB       NOT NULL DEFAULT '[]'::jsonb,
    "metadata"    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    "publishedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorefrontDesign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorefrontDesign_businessId_idx" ON "StorefrontDesign"("businessId");

ALTER TABLE "StorefrontDesign"
    ADD CONSTRAINT "StorefrontDesign_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;