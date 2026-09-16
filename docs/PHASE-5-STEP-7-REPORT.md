# SHOPORA — Phase 5 Report (STEP 7)

**Project:** SHOPORA — Build. Sell. Grow.
**Phase:** 5 — Product & Inventory Management
**Report date:** 15 September 2026
**Status:** ✅ COMPLETE

---

## 1. Phase scope

Turn the Phase 4 Products section real: tenant-scoped product catalogue
(categories, products, variants, images), inventory tracking with audit-trail
adjustments, and full CRUD screens in the dashboard — all isolated per business.

## 2. Deliverables vs. plan

| # | Deliverable | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Catalog schema: Category, Product, ProductImage, ProductVariant, InventoryTransaction | ✅ Done | `prisma/schema.prisma` — 5 new models + relations; migration `20260915000000_phase5_catalog` |
| 2 | Tenant-scoped catalogue queries (businessId from session only) | ✅ Done | `src/lib/catalog.ts` — every query filters by verified `businessId`; verified E2E (Business B sees 0 of A's data, 404/422 on cross-tenant access) |
| 3 | All Products page: search, category/status/stock filters, sort, pagination | ✅ Done | `products/all/page.tsx` + `/api/products` GET; E2E-verified (search/filter/sort/totalPages) |
| 4 | Add/Edit product form: images, variants, category, SEO, status | ✅ Done | `ProductForm.tsx`, `/api/products` POST + `/api/products/[id]` PATCH with image & variant sync |
| 5 | Categories CRUD with nesting (parentId) + tree endpoint | ✅ Done | `/api/categories`, `/api/categories/[id]`, `CategoryManager.tsx` |
| 6 | Inventory page: low-stock detection + manual adjustment writing InventoryTransaction | ✅ Done | `/api/inventory`, `InventoryPanel.tsx` — atomic `$transaction`, stock never < 0 |
| 7 | Subscription product-limit stub (Phase 9 TODO) | ✅ Done (stub) | `canCreateProduct` — `SUBSCRIPTION_PRODUCT_LIMIT` default 50, returns 403 at limit |

## 3. What was built

### 3.1 Data model (`prisma/schema.prisma`)

- **Category** — `parentId self-relation` for nesting, `slug` unique per business.
- **Product** — name, slug, description, brand, sku, `price`/`discountPrice`
  (Decimal), `status` (`draft|active|archived`), `stockQuantity` (base stock for
  non-variant products), SEO title/description, images + variants relations.
- **ProductImage** — ordered gallery (`position`).
- **ProductVariant** — sku/color/size/weight/priceOverride/stockQuantity for
  variant products. Effective stock = Σ variant stock when variants exist.
- **InventoryTransaction** — immutable audit trail (changeQty, reason,
  createdById, productId, variantId); every adjustment writes one.
- Cascade rules: product delete → images/variants; variant delete blocked by
  inventory history.

**Migration fix during testing:** the live DB had been drifted from the
migration history (Phase 2/3 auth fields were never captured in a migration).
Backfilled via `20260914000000_phase2_auth_fields` (User auth columns +
`Role.name` unique index) and replayed cleanly: `/api/auth/register` 500 →
201. Final migration state is fully consistent.

### 3.2 Server helpers (`src/lib/catalog.ts`)

- `serializeProduct/serializeVariant/serializeDecimal` — Decimal→number so the
  wire format is JSON-friendly (prices as numbers, not strings).
- `listProducts` — q / categoryId / status / stock (low|out — computed on
  effective stock then paginated so `total`/`totalPages` stay correct) / sort
  (newest, oldest, name, price_asc, price_desc, stock_asc, stock_desc) / page /
  pageSize (max 100).
- `getProduct`, `getCategoryTree` (nested, with product/child counts).
- `adjustInventory` — `$transaction`: validates ownership + variant, refuses
  negative result, writes the `InventoryTransaction`, updates stock atomically.
- `canCreateProduct` — `SUBSCRIPTION_PRODUCT_LIMIT` (env, default 50) stub for
  Phase 9.

### 3.3 API routes

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/products` | GET, POST | list (all filters), create with images + variants + slug uniqueness |
| `/api/products/[id]` | GET, PATCH, DELETE | PATCH syncs image rows + variants (update-by-id, create-new, delete-removed-if-no-history) |
| `/api/categories` | GET, POST | `?tree=1` returns nested tree |
| `/api/categories/[id]` | PATCH, DELETE | delete restricted to leaf categories with no products |
| `/api/inventory` | GET, POST | GET current stock with `lowStock` flags; POST `{productId, variantId?, changeQty, reason}` |
| `/api/uploads/product` | POST | product image upload (5 MB, PNG/JPEG/WebP/GIF) → `public/uploads/products/<date>/` |

All routes go through `requireAuthHandler` + `requirePermission`
(`products.read/write/delete`); category/inventory reuse the same permission
set. Guarded with `jsonOk/jsonCreated/jsonNoContent/jsonError`.

### 3.4 Dashboard screens

- `products/all/page.tsx` — server component: real data, search box, category /
  status / stock filter selects, sort select, pagination controls, stock badge +
  low-stock highlighting; `products/page.tsx` 307-redirects here.
- `products/add/page.tsx` + `products/[id]/edit/page.tsx` — `ProductForm.tsx`
  (name, brand, sku, price/discount, category, SEO, status, multi-image upload,
  dynamic variant rows with per-variant stock).
- `products/categories/page.tsx` — `CategoryManager.tsx` (tree, inline
  create/edit/delete, parent picker).
- `products/inventory/page.tsx` — `InventoryPanel.tsx` (stock table with
  low/out badges, adjustment form with reason + QTY-in/out).

### 3.5 Wiring

- `storage.ts`: `saveFile` now accepts `kind: 'product'` (5 MB suite of image
  types).
- `package.json`: `"test:products": "node scripts/verify-products.mjs"`.
- `.env.example`: `LOW_STOCK_THRESHOLD=5` (+ documented `SUBSCRIPTION_PRODUCT_LIMIT`).
- `README.md`: catalogue API table + project structure updated.

## 4. STEP 6 testing

### 4.1 Phase 5 HTTP E2E (`npm run test:products`)

Runs against a live dev server (`next dev -p 3200`): registers two fresh
businesses, drives onboarding via the real API, then exercises every catalogue
feature plus tenant isolation as owner A vs owner B.

**Result: ALL PHASE 5 CHECKS PASSED** (42 assertions across 6 groups):

- **Prepare:** both businesses registered + onboarding completed.
- **Category CRUD:** create, slug, nested (parentId), tree nests child under parent.
- **Product create:** 3 products (dress with 2 images + 2 variants, sandals, sun
  dress), uploads, slugs.
- **Inventory:** adjustment +25 → `InventoryTransaction` row persisted with
  correct changeQty/reason/businessId; variant stock 10→35.
- **All Products page data path:** list=3, search "ankara"=1, status active=2,
  category filter=2, stock out=1, stock low≥1, price asc first=8000,
  pagination totalPages=2 / page1=2 / page2=1 / no overlap.
- **CRUD + isolation:** PATCH price persists (number), DELETE works, count 3→2;
  Business B sees 0 products, 404 on A's product/category, 422 on A's stock
  adjustment; product-limit stub not hit.

### 4.2 Regression (`npm run test:core`, `npm run test:dashboard`)

- `test:core` — **ALL CHECKS PASSED** (18 assertions).
- `test:dashboard` — **ALL PHASE 4 CHECKS PASSED** after updating one assertion
  to match Phase 5 (the `/products` stub is now a 307 → `/products/all`).

### 4.3 Static checks

- `npx tsc --noEmit` — clean (no errors).
- ESLint: **not configured in the repo** (pre-existing, unchanged from Phase 4).

## 5. Known limitations & deferred work

- **Subscription `product_limit` is a stub** (`SUBSCRIPTION_PRODUCT_LIMIT` env,
  default 50). Real billing/plan limits land in Phase 9.
- **Image storage is local disk** (`public/uploads/products/`). Not suitable for
  the stateless Cloudflare deployment target — production should use object
  storage (e.g. R2/S3) as in prior phases.
- **Inventory adjustments are manual-only** — sales-linked decrementing lands
  when orders ship (Phase 7/8). Stock currently can only go down via manual
  negative adjustments.
- **Variant delete-on-PATCH is conditional** on having no inventory history;
  variants with history are kept and must be archived explicitly (no UI yet).
- **Category DELETE** blocks categories that have products or children;
  reassignment/move UI is deferred.
- **`products/all` pagination/Sort/filters** are server-rendered page reloads
  (form GET) — fine now, could become client-side with SWR/infinite scroll if the
  catalogue grows large.
- **Performance:** `next dev` cold-compiles the dashboard slowly (~6 min on this
  machine); warm re-runs are fast. CI should use a production build.
- **ESLint** still not configured (pre-existing; TypeScript is the check gate).

## 6. Sign-off

Phase 5 (STEP 1–7) is complete and test-verified. The owner-facing product
catalogue and inventory are live behind the dashboard. Recommended next phase:
**Phase 6 — Customer/Public Storefront** (render active products by slug,
product detail pages, category browsing) using the catalogue data model built
here.

---

**Uncommitted (blocked):** Phase 4 + Phase 5 changes are uncommitted — `git` is
not installed on this machine. Recommend `git init && git add -A && git commit`
once a VCS is available, or drop the repo into a git host and stage there.