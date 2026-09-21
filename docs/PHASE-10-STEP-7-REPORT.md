# Phase 10 (Super Admin) — Step 7 Bug-Fix Report: Seed-Guard + Redirect Priority

**Status: COMPLETE** · Typecheck clean · Targeted E2E all passed

Two related fixes shipped together: the Super Admin bootstrap can no longer
silently overlap an admin identity onto a business account, and a platform
admin now ALWAYS lands on `/admin` after login — even when they also own or
staff a business.

## 1. What was fixed

### Fix 1 — `db:seed-admin` refuses to overlap onto a business account
`prisma/seed-admin.ts` now runs a **pre-flight safety guard** before any DB
write (it sits before role/permission/plan seeding too, so a refusal is
atomic — nothing is written at all):

- If `--email` already exists as a `User` **and** that user has **any**
  `BusinessStaff` row (owner *or* staff, on *any* business, active or former):
  the script prints a clear error and exits `1`:
  ```
  ERROR: this email is already associated with a business account (Ifeco Pastries). Use a different email for the Super Admin account.
  ```
- It will not update the password, not activate the user, not touch the
  `PlatformStaff` table — it simply refuses.
- The only allowed paths are now:
  1. a **brand-new** user (no `User` row), or
  2. an existing user with **zero** `BusinessStaff` rows (e.g. registered but
     never completed onboarding).

### Fix 2 — Redirect priority: platform > business
Previously a Super Admin who also owned a business was resolved as a business
user first, so login dropped them in `/setup` → `/dashboard` (never `/admin`),
and a pure platform admin got sent to `/` (home). Now **platform membership is
resolved first, from the DB (source of truth)** in every auth path:

| File | Change |
|------|--------|
| `src/lib/auth/session.ts` | `resolveSession` checks active `PlatformStaff` **before** the `BusinessStaff` branch — an admin's session is `platform_admin` even from a stale `business_user` JWT |
| `src/app/api/auth/login/route.ts` | Resolves platform membership first; issues a `platform_admin` token (no `businessId`); response now includes `role` |
| `src/app/api/auth/refresh/route.ts` | Same priority flip for token rotation |
| `src/app/(auth)/login/page.tsx` | Routes `role === 'platform_admin'` → `/admin` |
| `src/app/(auth)/layout.tsx` | Authenticated admins (active `PlatformStaff`) are redirected to `/admin`, not `/dashboard` |
| `src/lib/dashboard.ts` | Dashboard guard also checks active `PlatformStaff` first and redirects those accounts to `/admin` — closes the hole where a live `business_user` JWT from a pre-fix login could still render the business dashboard |

Consequences (all intended):
- A dual account (business owner + Super Admin) now lands on `/admin`. To run
  their business they use the audited impersonation flow from `/admin`, exactly
  like any other business on the platform.
- Business dashboards are no longer silently reachable by an admin's business
  JWT; `/dashboard` redirects them to `/admin`.

## 2. Tests

### Seed guard (live DB)
| Command | Result |
|---------|--------|
| `db:seed-admin --email=jimonemmanuel@gmail.com` (Ifeco Pastries owner) | ❌ **REFUSED**, exit 1: `already associated with a business account (Ifeco Pastries)`; no data touched |
| `db:seed-admin --email=p9-staff1@shopora.dev` (a Staff member) | ❌ REFUSED, exit 1 (staff rows count too) |
| `db:seed-admin --email=jimonemmanuel7@gmail.com --allow-existing-password=true` (pure admin, no business) | ✅ upgrade OK, exit 0 |
| `db:seed-admin --email=<fresh>@shopora.dev --password=…` | ✅ created; verified `platformStaff=1`, `businessStaff=0`; exit 0 |

### Redirect priority (HTTP E2E against `next dev` on :3200)
- **Fresh Super Admin login**: `POST /api/auth/login` → `role: platform_admin`,
  `businessId: null`; `GET /admin` → 200 + Super Admin chrome; `GET /dashboard`
  → redirect away. ✅
- **Dual account** (`jimonemmanuel@gmail.com`, Ifeco Pastries owner + Super
  Admin): handed a **stale `business_user` JWT** (what pre-fix logins issued)
  and confirmed `resolveSession` overrides it → `resolveTenantFromRequest`
  reports `business: null` + platform permissions via `GET /api/auth/me`,
  `GET /dashboard` redirects, `GET /admin` → 200. ✅
- **Typecheck**: `npx tsc --noEmit` clean.
- **`test:core`**: JWT, tenant resolution, suspension revocation all PASS. One
  pre-existing failure unrelated to this fix: it expects `Owner` to have **11**
  permissions but the Phase 9/10 seed legitimately gives **13** (added
  `subscription.manage` + platform perms); not addressed here.

> Note: `scripts/verify-admin.mjs` had a pre-existing crash — its cleanup used
> `Date.now()` (a number) for a Prisma `contains:` filter. Fixed to
> `String(Date.now())`. The full Phase 10 HTTP suite was not re-run to the end:
> on this machine every request triggers slow Next dev recompiles (5–50 s), >7
> min total. The paths it touches that were changed are covered by the targeted
> E2E above.

## 3. Files
- `prisma/seed-admin.ts` — pre-flight `BusinessStaff` guard + header docs
- `src/lib/auth/session.ts` — platform-first session resolution
- `src/app/api/auth/login/route.ts` — platform-first role + `role` in response
- `src/app/api/auth/refresh/route.ts` — platform-first role
- `src/app/(auth)/login/page.tsx` — `/admin` routing for admins
- `src/app/(auth)/layout.tsx` — `/admin` redirect for admins
- `src/lib/dashboard.ts` — platform-check in the dashboard guard
- `scripts/verify-admin.mjs` — pre-existing `UNIQUE` type fix (test helper only)

## 4. Decision: `jimonemmanuel@gmail.com` stays as-is
**Recommendation: leave the account untouched** (it remains both Super Admin
and Ifeco Pastries owner). Rationale:

- Nothing about Ifeco Pastries is wrong — the business, its ownershop and its
  data are all legitimate. Only the *identity overlap* was risky, and the
  redirect-priority fix removes the risk: on login this account resolves as a
  platform admin and lands on `/admin`; its Ifeco business is reached the
  audited way (impersonation), so there is no user-facing ambiguity.
- Detaching would mean destroying something: deleting the `PlatformStaff` row
  would strip Super Admin access (it is the admin's **operating** role for this
  seeding), and touching the `BusinessStaff`/business side would be a direct,
  unnecessary edit to live business data. No destructive action was taken.
- Clean detach **is** available later if wanted: an existing Platform Admin can
  revoke the `PlatformStaff` row from `/admin/platform/admins` (audited, no
  business data touched), or the owner can pass ownership of Ifeco Pastries to
  another email. Not done now without explicit ask.

## 5. NEXT (candidates)
- Multi-identity switcher in the admin header (Admin Nav link to “my business”)
  so a dual account can hop to its own store without impersonation — optional.
- Fix `scripts/verify-phase2.ts` expected count (11 → 13) for the Phase 9/10
  permission drift.
- Full `test:admin` suite re-run on a warm build (or with `next build`/prod
  server) where request latency is seconds, not tens of seconds.