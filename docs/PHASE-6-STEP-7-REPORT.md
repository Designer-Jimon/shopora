# Phase 6 — Customer Storefront — STEP 7 REPORT

**Date:** 2026-09-16
**Prerequisites:** Phase 5 approved & committed (eca1da2); Phase 2 auth-pages gap fixed (472ca6d)

## What was implemented

Real customer-facing storefront driven by the tenant-by-slug resolution, replacing the Phase 1 placeholder shell. A public visitor hitting `/<business-slug>` now sees a fully branded store rendered with that business's `themeConfig`, product catalog, and search/filter experience — scoped strictly to one business with no cross-tenant data leakage.

### Core features delivered

- **Tenant-by-slug resolution** (`getStorefrontBusiness` in `src/lib/storefront.ts`) — reads Business by slug, gates on `isActive`, merges `themeConfig` over code defaults via `resolveTheme`, then applies it as CSS custom properties (`--sf-*`) scoped to `[data-theme="storefront"]`. The global `:root` tokens (dashboard, landing) are never modified, so per-store branding has zero side-effect on admin or platform surfaces. Missing/malformed/inactive slugs now return a real HTTP 404 (via `notFound()`), not the old 200-status preview shell.
- **Homepage** (`/:slug`) — hero banner (or primary-tint gradient fallback when no banner uploaded), logo + store name + description, CTA linking to the listing. Featured categories section with product counts. New arrivals grid (newest 8 active products).
- **Product listing** (`/:slug/products`) — mobile-first grid (2-col base, 4-col lg). Native GET form filters: text search, category dropdown, min/max price, sort (newest / price asc / price desc). Server-side pagination (12 per page, preserving query params across pages). Shows total count and per-page slice.
- **Product detail** (`/:slug/products/:productSlug`) — image gallery (main + thumbnails via `Gallery.tsx` client component with broken-image fallback), breadcrumbs, product info (name, brand, category link, description), and the `BuyPanel` client component.
- **BuyPanel** — displays the effective display price (discountPrice minimum), strikethrough original, stock status ("In stock" / "Only X left" / "Sold out"), colour + size variant selectors derived from distinct variant attributes, quantity picker (1–5 capped to stock), and two stub action buttons ("Add to cart" / "Buy now") that show an honest "Cart & checkout arrive in Phase 7" notice. No fake cart; no persistence.
- **ProductCard** — reusable server-safe card component with image fallback, discount percentage badge, stock status dot, links to detail. Used on both homepage and listing.
- **Per-store chrome** — `StorefrontLayout` wraps the whole storefront in a themed header (logo/initial + name + "Products" link + "SHOPORA" back-to-platform link) and footer (store description, contact info, "Powered by SHOPORA"). Dynamic viewport `theme-color` reflects the store's primary color (native mobile address-bar theming).
- **Branded 404** — new root `src/app/not-found.tsx` renders a styled "Page not found" screen instead of the default browser/text fallback.

### Route decision — kept `/[slug]` (not `/store/[slug]`)

The original Phase 1 spec documents the storefront at `/:slug`. In Next.js App Router, static segments always beat dynamic segments, so `/[slug]` never conflicts with `/login`, `/dashboard`, `/api/*`, `/setup/*`, or any other static path. The root-level `/:slug` pattern mirrors the eventual custom-domain model (`<slug>.shopora.ng` or `<slug>.shopora.com`) and requires no migration from the existing Phase 1 intent. No benefit in moving to `/store/[slug]`.

### Isolation guarantees

Every storefront query is scoped by the `businessId` resolved server-side from the URL slug — client input never passes a `businessId`. Only `status: 'active'` products and categories are exposed. Cross-tenant, draft, and archived products all return proper 404s. The E2E test (below) explicitly verifies cross-tenant isolation, inactive-store 404, and that the landing page (`/`) does not contain any storefront-specific CSS variables.

## Files created

| File | Description |
|---|---|
| `src/lib/storefront.ts` | Public storefront helpers: tenant resolution, scoped product listing, new arrivals, active categories, single product lookup |
| `src/lib/format.ts` | `formatPrice` (₦ NGN formatting) and `discountPercent` helper |
| `src/app/(storefront)/[slug]/layout.tsx` | Tenant resolution, `--sf-*` theme injection, storefront header/footer, `generateViewport` + `generateMetadata`, force-dynamic |
| `src/app/(storefront)/[slug]/page.tsx` | Storefront homepage: hero, featured categories, new arrivals grid |
| `src/app/(storefront)/[slug]/products/page.tsx` | Listing: native GET form filters, pagination, `ProductCard` grid |
| `src/app/(storefront)/[slug]/products/[productSlug]/page.tsx` | Product detail: gallery, info, BuyPanel; SEO metadata from `seoTitle`/`seoDescription` |
| `src/app/(storefront)/_components/ProductCard.tsx` | `'use client'` card component (image, name, price, discount %, stock status dot) |
| `src/app/(storefront)/_components/Gallery.tsx` | `'use client'` image gallery (main + clickable thumbnails) |
| `src/app/(storefront)/_components/BuyPanel.tsx` | `'use client'` variant/qty selector + stub cart/buy buttons |
| `src/app/not-found.tsx` | Branded global 404 page |
| `scripts/verify-storefront.mjs` | Full Phase 6 HTTP E2E test |

## Files modified

| File | What changed |
|---|---|
| `src/lib/theme.ts` | Added `hexToRgb`, `rgbaFromHex`, `isLightColor` (contrast-aware button foreground), `themeCssVars` (builds the `--sf-*` block) |
| `src/app/(storefront)/[slug]/page.tsx` | Replaced placeholder shell with real homepage |
| `package.json` | Added `"test:storefront"` script |
| `README.md` | Updated route description, testing section, project structure to reflect storefront + new lib files |

## How to test locally

```bash
# 1. Start the dev server
npm run dev -- -p 3200

# 2. Run the Phase 6 E2E suite (creates+cleans its own test data)
npm run test:storefront
```

The test suite creates two businesses with distinct brand colours and product catalogs, exercises all storefront routes, and leaves the database clean. All assertions are HTTP-level (no browser required).

To inspect manually in the browser:
1. Create a business through `/register`, complete the onboarding wizard through branding (pick a brand colour, upload logo/banner).
2. Add a few products with `status: active`, some with variants.
3. Visit `http://localhost:3000/<your-slug>` and confirm the theme, hero, category, and product cards all render.
4. Visit `http://localhost:3000/nonexistent-slug` and confirm you see the 404 page.

## Known limitations (addressed in later phases)

- **No cart / checkout** — Add to cart and Buy now buttons display a "Cart & checkout arrive in Phase 7" notice. No persistence, no order creation. (Phase 7)
- **No payment processing** — requires cart + checkout first. (Phase 8)
- **"Trending" = newest active** — there is no order history or popularity signal yet; the homepage "New arrivals" section honestly shows the most recently created active products. (Phase 7: order data will let this compute from real purchases.)
- **No `isFeatured` / manual curation flag** — no schema change made in this phase; the homepage section is a fixed "New arrivals" grid. Adding a product-level `featured` flag (admin toggle) is a cheap future enhancement.
- **Price filter is in-memory** — correct for the current `product_limit` stub (max ~50 products). For larger catalogs, push effective-price filtering into a DB-generated column or materialized view.
- **Product image disk storage** — `public/uploads/` local filesystem storage only. Real object storage (R2/S3) is required before Cloudflare Workers deployment. (see Phase 9 notes)
- **Browser-level mobile testing not automated** — no Playwright/Cypress available; test suite asserts mobile-first CSS class presence and responsive grid markup. Actual phone rendering should be spot-checked during QA.

## Recommended next step

**Phase 7: Shopping cart and checkout.** This adds a server-side cart (line-item storage, variant/stock validation), cart UI (quantity adjustment, remove items, shipping address), and order creation flow. Payment integration (Paystack for NGN) can land in the same phase or Phase 8 depending on scope appetite.