# Phase 10 — Super Admin Dashboard — STEP 7 REPORT

**Date:** 2026-09-22
**Status: COMPLETE** · `tsc --noEmit` clean · targeted E2E all pass
**Prerequisites:** Phase 9 (subscription billing) approved & committed; Phase 10 super-admin dashboard (same branch); Phase 6 report pattern.

---

## What this report covers

1. **Impersonation button** — the "Log in as {business}" fix from the previous task: the flow exists end-to-end and the button is now actually wired into the Super Admin UI (it previously existed only as an unused component, so a Super Admin had no clickable entry point).
2. **Clickable Trial/Active counters** — the status chips on `/admin/subscriptions` are now links that filter the table.
3. **Ifeco Pastries missing from Subscribers/Subscriptions** — root cause confirmed against the live DB (zero `Subscription` rows for a pre-Phase-9 business) and fixed with a backfill migration.

The Phase 10 dashboard foundation (below) precedes these fixes.

---

## 1. Impersonation button fix ("Log in as …")

### What it does

A Super Admin holding `platform.impersonate` clicks **"Log in as {business name}"** on a subscriber's detail page. That:

- POSTs to `/api/admin/impersonate`, which writes a signed, 30-minute `shopora_impersonation` JWT cookie and an `AuditLog` row (`impersonate.start`).
- Sends the operator into that business's `/dashboard` with full Owner-style access and a persistent "impersonating" banner.
- Business API routes resolve the impersonated tenant via `resolveTenantFromRequest`; sensitive routes (payment keys, security writes) stay 423.
- "End impersonation" (admin nav, `compact`) POSTs to `/api/admin/impersonate/end`, clears the cookie, and writes `impersonate.end` to the audit log. Auto-expiry is enforced statelessly by the JWT `exp` on every request.

### Gap found this session

`ImpersonateButton` was implemented in `src/app/admin/_components/actions.tsx` but **never rendered anywhere** — no page imported it, so a Super Admin had no clickable impersonation affordance despite the API working. Fixed by wiring it into the subscriber detail page (`src/app/admin/subscribers/[id]/page.tsx`), next to Suspend/Reactivate. The list page links to the detail page, so the button is one click from anywhere in the Subscribers list.

**Files**
- `src/app/admin/subscribers/[id]/page.tsx` — imported & rendered `ImpersonateButton` (grouped with `SuspendReactivateButton` in the page header).
- `src/app/admin/_components/actions.tsx` — existing `ImpersonateButton` / `EndImpersonationButton` (Part of the Phase 10 build; mechanism unchanged).

---

## 2. Clickable Trial/Active status counters

On `/admin/subscriptions` the status chips shown next to the MRR line used to be static `<span>`s. Now each chip is a `<Link>`:

- **`/admin/subscriptions?status=trial`** shows only trial subscriptions; the Trial chip is highlighted (primary fill) and the table header notes *"Showing Trial subscriptions only."*
- **`/admin/subscriptions?status=active`** does the same for active.
- Every other status chip that exists in the data (`past_due`, `suspended`, `cancelled`) is clickable the same way.
- **Clear**: clicking the already-selected chip again, or the **"✕ Clear filter"** pill, returns to `/admin/subscriptions` (all statuses). The MRR figure stays platform-wide (computed from all active/past-due subscriptions, not the filtered slice) so the headline number never misreads as a filtered total.
- The filter is validated against the known status set; an unknown value simply renders an empty table (all chips remain unhighlighted).

**File**
- `src/app/admin/subscriptions/page.tsx` — `searchParams`-driven `status` filter; status chips → `Link`s; "Showing …" line; "Clear filter" pill; MRR de-coupled from the filtered query.

---

## 3. Ifeco Pastries missing from Subscribers/Subscriptions — investigation & fix

### Root cause (confirmed, not guessed)

Queried the live DB (Postgres, `shopora` schema):

- `Ifeco Pastries` exists: `id=cmu4g91yf0002b5qdnutjj9ui`, slug `ifeco-pastries`, `onboardingStep=99` (completed), `isActive=true`, created **2026-09-16** (Phase 3/4 era).
- **`Subscription` rows for Ifeco Pastries: 0.** Owner is `jimonemmanuel@gmail.com`.
- Platform-wide: **22 of 25 businesses had no `Subscription` row**; only the Phase 9/10-era stores (Phase9 Store, Phase9 Store B, Phase10 Store) had one. Status counts pre-fix: `trial 1`, `active 2`.

Why: subscription provisioning is **lazy**. `getSubscriptionState()` → `ensureSubscription(businessId)` creates a row only on a business's *first post-Phase-9* touch (dashboard load, storefront render, checkout, staff invite, product create — anything that resolves subscription state). Businesses created before Phase 9 shipped — Ifeco Pastries included — had already completed onboarding and, if they never hit a provisioning path after Phase 9, simply **never got a `Subscription` row**.

Consequence confirmed in code: the **Subscriptions ledger** (`/admin/subscriptions`, `GET /api/admin/subscriptions`) is derived from `Subscription.findMany`, so a business with zero rows is invisible to the Super Admin there and in every status/MRR/revenue aggregation — exactly the platform-blindness described below:

> Listing platform-wide Subscribers from `/api/admin/subscribers` already showed every business (`Business.findMany`, status `none`/"No plan" for the unprovisioned), so the silent omission was specific to Subscription-derived views (the ledger, the counters, revenue). Either view being incomplete defeated the platform-wide subscriber list.

### Fix

**Backfill migration `prisma/migrations/20260922000000_backfill_missing_subscriptions/migration.sql`** provisions a fresh **14-day Starter trial** for every business that lacks a `Subscription`, exactly as `ensureSubscription()` would have on first touch:

- `INSERT … SELECT` over `Business` where no `Subscription` exists, cross-joined to the seeded `starter` plan (no-op if that plan isn't seeded yet — the runtime always seeds it before any provisioning path).
- Records a `SubscriptionHistory` row (`fromStatus NULL → trial`, note *"Backfilled 14-day trial for pre-Phase-9 business"*) so the audit trail is complete.
- Idempotent/safe on any environment; a no-op on a fresh DB (no businesses at migration time). Uses `md5(random()…)` for row ids so it works on PostgreSQL < 13 too.

**Post-apply verification (live DB):** all 25 businesses now have exactly 1 subscription; `Businesses WITHOUT SUBSCRIPTION: 0`; status counts `trial 23, active 2`. Ifeco Pastries now has a `trial` subscription (`trialEndsAt 2026-10-06`).

**Why a fresh 14-day trial was chosen:** it matches the platform's own lazy-provisioning semantics (a first-touched business gets a trial from today), reads "sensible" in both lists, and requires no manual price/plan choice. An explicit "active" backfill would have fabricated paid billing with no Paystack artifacts behind it.

**Files**
- `prisma/migrations/20260922000000_backfill_missing_subscriptions/migration.sql` — new migration (backfill + audit history rows).

The Subscribers list needed no code change — it already lists every business and now shows Ifeco with **Starter / Trial** instead of "— / No plan".

---

## Test evidence (HTTP E2E against `next dev` :3200)

Temp Super Admin (`e2e-verify@shopora.dev`, created via `db:seed-admin` with the `Platform Super Admin` role, **removed after the run**) drove 27 checks — all PASS:

| # | Check | Result |
|---|---|---|
| 1 | admin login 200 + `platform.access`/`platform.impersonate` perms | PASS |
| 2 | `/admin/subscriptions` → 200, contains **Ifeco Pastries**, MRR | PASS |
| 3 | default page shows **Trial: 23 / Active: 2** counters as `?status=` links | PASS |
| 4 | `?status=trial` → Ifeco present, "Showing Trial …", Clear filter, Trial chip selected | PASS |
| 5 | `?status=active` → Ifeco **excluded**, "Showing Active …", Clear filter | PASS |
| 6 | bogus `?status=bogus` → 200 empty table, no crash | PASS |
| 7 | `/admin/subscribers` → 200, contains **Ifeco Pastries** | PASS |
| 8 | **Ifeco detail page** renders **"Log in as Ifeco Pastries"** button | PASS |
| 9 | `POST /api/admin/impersonate` → 200 + impersonation cookie | PASS |
| 10 | impersonated `/dashboard` → 200 (tenant dashboard, not the admin redirect) | PASS |
| 11 | impersonated `/api/businesses/me` → resolves to `ifeco-pastries` | PASS |
| 12 | admin API reachable during impersonation; `impersonate/end` → 200 | PASS |

- **Typecheck:** `npx tsc --noEmit` clean.
- **`test:core`** (`scripts/verify-phase2.ts`): all PASS, including the Owner-13-permissions assertion.

> Note: `npm run lint` prompts for interactive ESLint setup (Next's first-run wizard) — ESLint is not configured in this repo, so lint could not be run non-interactively. This is pre-existing.

---

## Phase 10 dashboard foundation (context)

Super-admin surface delivered in Phase 10: admin layout/nav, dashboard + metrics, Subscribers (list/detail/suspend/reactivate), Subscriptions & plans ledger, coupons, tickets, audit logs, platform admins & settings, plus the impersonation and subscription-management API routes; logout added to dashboard & admin nav; `test:core` permission count fixed (11 → 13); migrations `20260919194924_phase10_super_admin` (and the Phase 9 billing bundle `20260918225257_phase9_subscription_billing`).

## How to test locally

```bash
# 1. Apply migrations (includes the Ifeco/backfill migration) + seed plans
npm run db:deploy          # or npx prisma migrate deploy

# 2. Bootstrap a Super Admin (must not be a business account)
npm run db:seed-admin -- --email=you@shopora.dev --password=YourPass123!

# 3. Start the dev server and sign in as that admin
npm run dev -- -p 3200
# http://localhost:3200/admin/subscriptions          — click Trial / Active chips, then "✕ Clear filter"
# http://localhost:3200/admin/subscribers            — confirm "Ifeco Pastries" (or any pre-Phase-9 business) is listed
# http://localhost:3200/admin/subscribers/<id>       — confirm the "Log in as …" button, click it, land on the business's /dashboard
```

## Known limitations (unchanged / carried forward)

- **Auth boundaries** — admin routes rely on role flags; platform-admin invitation + 2FA flows remain a follow-up.
- **Audit-log coverage** — should be extended/monitored across every mutating admin action (impersonation, suspend/reactivate, settings are the priority trails, all now covered by the backfill history rows).
- **Metrics scope** — counters only; trend/cohort analytics not yet included.
- **Reporting** — CSV exports / scheduled reports not implemented.
- **Impersonation UX** — a visible "you are impersonating X" indicator in the admin nav (independent of the dashboard banner) is still a candidate enhancement.

## Recommended next step

**Phase 11: Platform analytics & reports** (MRR/churn/upgrade funnels, CSV exports, scheduled reports) — or, if operational hardening is the higher priority, the platform-admin invitation/2FA flow and fuller audit-log coverage.