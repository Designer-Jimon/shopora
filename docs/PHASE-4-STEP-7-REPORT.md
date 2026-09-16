# SHOPORA — Phase 4 Report (STEP 7)

**Project:** SHOPORA — Build. Sell. Grow.
**Phase:** 4 — Business Admin Dashboard Shell
**Report date:** 15 September 2026
**Status:** ✅ COMPLETE

---

## 1. Phase scope

Build the authenticated business dashboard shell: a permission-aware sidebar,
an overview homepage with placeholder metrics, mobile responsiveness, and the
onboarding-completion gate that keeps mid-onboarding businesses out and sends
completed businesses from /setup into the dashboard.

## 2. Deliverables vs. plan

| # | Deliverable | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Sidebar nav structure (Dashboard, Products, Sales, Marketing, Store, Payments, Subscription, Settings) | ✅ Done | `src/lib/dashboard-nav.ts` — 8 top-level sections, 16 child routes, all gated by seeded permissions |
| 2 | Dashboard homepage with placeholder metric cards | ✅ Done | `src/app/(dashboard)/dashboard/page.tsx` — 7 metric cards (₦0.00/0 placeholders) + empty Recent orders / Top products widgets; `MetricCard.tsx` |
| 3 | Mobile responsiveness (sidebar collapses to slide-in drawer on small screens) | ✅ Done | `DashboardNav.tsx` — hamburger + overlay drawer < `lg`, persistent 256px sidebar ≥ `lg`, sticky content header |
| 4 | Onboarding-completion guard on dashboard routes | ✅ Done | `src/lib/dashboard.ts` — `resolveDashboardAccess` rejects suspended/inactive users, redirects mid-onboarding → `/setup`, customers/platform → `/`, unauthenticated → `/login`; enforced in `(dashboard)/layout.tsx` |
| 5 | Permission-aware nav visibility (Owner sees everything; Staff sees only permitted sections) | ✅ Done | `buildDashboardNav` filters by role + DB-loaded permission set; mirrored in `SectionLanding` for section landing pages |
| 6 | STEP 6 testing | ✅ Done | `test:core` (headless) PASS; `test:dashboard` (HTTP E2E) ALL CHECKS PASSED |
| 7 | STEP 7 report | ✅ Done | This document |

## 3. What was built

### 3.1 Navigation & route shell

- **`src/lib/dashboard-nav.ts`** — single source of truth for the dashboard IA.
  Every section and child declares its required permission. Owners bypass the
  filter; non-Owners get only items whose permission is in their DB-resolved set.
  UI-only filtering — server-side authorization is enforced per route/API as
  features land (documented in the header comment; never a security boundary).
- **Route stubs** — 26 `page.tsx` files across all 8 sections using shared
  `PageStub`/`SectionLanding` components. Section landings surface only the child
  links the current role may see (mirrors the sidebar filter).

### 3.2 Dashboard homepage

- `dashboard/page.tsx` renders the placeholders:
  - **Metric cards:** Total sales, Sales this month, Total orders, Pending
    orders, Completed orders, Total customers, Low stock products.
  - **Widgets:** Recent orders and Top selling products — empty-state panels
    explaining the data will arrive in Phase 5+.

### 3.3 Mobile responsiveness

- `DashboardNav.tsx` (client component, `'use client'`):
  - < `lg`: hamburger button in the sticky header opens a slide-in drawer with
    overlay (accessible label, closes on backdrop click or navigation).
  - ≥ `lg`: fixed-width persistent sidebar (`sticky top-0 h-screen`).
  - Active-section/active-item highlighting driven by `usePathname`.

### 3.4 Onboarding-completion guard

- `src/lib/dashboard.ts` — resolves the dashboard session from the cookie,
  **re-loads user + staff + business from the DB** (not just JWT claims) so a
  suspended user is rejected even with a valid token, then enforces the
  `onboardingStep === 99` gate (`isOnboardingComplete`).
- `src/app/(onboarding)/layout.tsx` — the inverse guard: completed businesses
  hitting /setup are bounced to /dashboard. Both layouts verified E2E.

### 3.5 Permission-aware visibility

- Owner: full nav (8 sections) — verified in HTML output during E2E.
- Staff (seeded with Products/Orders/Customers/Transactions/Settings perms):
  sees Products, Sales, Store, Settings; hidden from Marketing, Payments,
  Subscription; child-level gating works too (Domain / `settings.write` hidden).

## 4. STEP 6 testing

### 4.1 Headless core test (`npm run test:core`)

Runs against the live Postgres DB. Covers argon2 hashing, seeded roles/permissions,
register → JWT → tenant resolution → suspension revocation.

**Result: ALL CHECKS PASSED** (18 assertions across 7 groups).

### 4.2 Dashboard HTTP E2E (`npm run test:dashboard`)

Runs against a live dev server (`next dev -p 3200`), registering fresh tenants and
driving onboarding through the real API.

**Result: ALL PHASE 4 CHECKS PASSED** (21 assertions):

- Owner nav: `/dashboard` 200; all 8 sections present.
- Stubs: `/products` landing 200, `/products/inventory` stub 200, mobile drawer
  trigger rendered.
- Staff nav: `/dashboard` 200; Products/Sales/Store/Settings visible;
  Marketing/Payments/Subscription hidden; Store Settings visible; Domain hidden.
- Guard: incomplete business `/dashboard` → 307 to `/setup`.
- Non-business user (customer) `/dashboard` → 307 away.

### 4.3 Static checks

- `npx tsc --noEmit` — clean (no errors).
- ESLint: **not configured in the repo** (pre-existing — `next lint` opens the
  interactive setup prompt). Flagged as a known limitation; the Phase 2+ code has
  never had a lint config. No lint failures attributable to Phase 4.

## 5. Known limitations & deferred work

- **ESLint** is not configured; the project relies on TypeScript checks only.
  Recommend adding `eslint-config-next` in a future phase.
- **Route stubs are placeholder-only.** Real feature pages (products CRUD,
  orders, payments) ship in Phases 5–8. Nav-level permission filtering is UI
  convenience; server-side `requirePermission` is enforced as each feature lands.
- **Dashboard metrics are static** (₦0.00 / 0). They will be wired to real
  queries once orders exist.
- **No bottom-nav alternative** on mobile — the drawer satisfies the plan, but a
  bottom tab bar could be considered for ergonomics later.
- Performance of `next dev` on this machine is slow to first-compile `/dashboard`
  (≈6 min cold). Warm re-runs are fast; CI should use a production build.

## 6. Sign-off

Phase 4 (STEP 1–7) is complete and test-verified. The dashboard shell is ready
for Phase 5 (storefront + catalogue) to begin feeding it real data.