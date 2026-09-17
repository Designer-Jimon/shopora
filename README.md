# SHOPORA â€” Build. Sell. Grow.

Multi-tenant e-commerce SaaS for Nigerian and African businesses.

## Stack (Phase 1 + 2)

- **Frontend + API**: Next.js 14 (App Router) â€” single app, route groups
  - `(storefront)` â€” customer-facing tenant storefronts (`/:slug`, `/:slug/products`, `/:slug/products/:productSlug`)
  - `(dashboard)` â€” business owner/staff workspace (`/dashboard`)
  - `/api/*` â€” API routes (auth + health)
- **Database**: PostgreSQL + Prisma
- **Auth**: argon2id password hashing + JWT sessions (access 15m / refresh 30d) via `jose`
- **Styling**: Tailwind CSS + CSS custom properties (design tokens)
- **Theme**: white + wine red (`#722F37`) defaults, overridable per business via `Business.themeConfig`

## Getting started

```bash
npm install
cp .env.example .env       # set DATABASE_URL + JWT_ACCESS_SECRET + JWT_REFRESH_SECRET

# create the database (once) and apply migrations + seed roles
createdb shopora            # or via psql: CREATE DATABASE shopora;
npm run db:migrate          # applies migrations to your local Postgres
npm run db:seed             # creates Owner + Staff roles and the permission set

npm run dev                 # http://localhost:3000
```

### Database

```bash
npm run db:migrate         # apply migrations
npm run db:generate        # regenerate Prisma client after schema edits
npm run db:deploy          # apply migrations in CI/production
npm run db:seed            # (re)seed system roles/permissions (idempotent)
npm run db:studio          # browse the database
```

### Testing

```bash
npm run test:core          # headless core auth logic against live DB (registerâ†’JWTâ†’tenant resolutionâ†’suspension)
npm run test:api           # HTTP E2E against a running server (set API_BASE, e.g. http://localhost:3000)
npm run test:storefront    # Phase 6 storefront E2E (tenant-by-slug, theme isolation, 404s, listing filters)
npm run test:checkout      # Phase 7 guest cart + checkout E2E (cookie cart, order/stock/inventory, isolation)
```

## API routes (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create user (+ Business + Owner row if `kind=business`). Sets session cookies. |
| POST | `/api/auth/login` | Validate credentials, issue session cookies. |
| POST | `/api/auth/logout` | Clear session cookies. |
| POST | `/api/auth/refresh` | Rotate session via refresh token cookie. |
| POST | `/api/auth/forgot-password` | Generate password-reset token. **Email delivery stubbed** â€” logs link to console; in dev returns `_dev_resetUrl`. |
| POST | `/api/auth/reset-password` | Consume token, set new password. |
| GET | `/api/auth/me` | Current user + business + permissions (requires session â†’ 401). |
| GET | `/api/health` | Health check; reflects resolved auth context. |

### Catalog (Phase 5)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products: `?q=&category=&status=&stock=low\|out&sort=&page=&pageSize=` (owner/staff). |
| POST | `/api/products` | Create product (name/price required; images + variants + SEO + status). Enforces `product_limit` stub (Phase 9 TODO). |
| GET | `/api/products/:id` | Single product with images + variants (tenant-scoped → 404 cross-tenant). |
| PATCH | `/api/products/:id` | Update product fields, images, variants. |
| DELETE | `/api/products/:id` | Delete product (cascades images/variants/inventory history). |
| GET | `/api/categories` | List categories (`?tree=1` returns nested tree with product counts). |
| POST | `/api/categories` | Create category (`parentId` for nesting). |
| PATCH | `/api/categories/:id` | Rename / reparent category. |
| DELETE | `/api/categories/:id` | Delete category (empty categories only; products become uncategorised). |
| GET | `/api/inventory` | Current stock levels + low/out counts (`?productId=` for one). |
| POST | `/api/inventory` | Manual stock adjustment → writes an `InventoryTransaction` row then updates stock atomically. |
| POST | `/api/uploads/product` | Product image upload (multipart `file`; local disk, 5 MB, PNG/JPG/WebP/GIF/SVG). |

Product status values: `draft` | `active` | `archived`. Every catalog query is
scoped by the verified session's `businessId` — no endpoint accepts a client
`businessId`.

### Storefront cart + checkout (Phase 7)

Guest carts are identified by the `shopora_cart_session` cookie (httpOnly,
30-day, contains a random session id), scoped per business.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/store/:slug/cart` | Read the session cart (lines + totals). Public. |
| POST | `/api/store/:slug/cart` | Add item (`{ productId, variantId?, quantity }`); merges same product+variant. Sets the cart cookie on first use. |
| PATCH | `/api/store/:slug/cart` | Update a line's quantity (`{ itemId, quantity }`). |
| DELETE | `/api/store/:slug/cart/:itemId` | Remove a line. |
| POST | `/api/store/:slug/checkout` | Place an order: validates stock, decrements it (race-safe `updateMany`), writes `InventoryTransaction` rows, snapshots prices into `OrderItem`, writes `OrderStatusHistory`, empties the cart. Guests and logged-in customers both supported. |

Storefront pages: `/:slug/cart` (cart + quantity steppers), `/:slug/checkout`
(4-step wizard: contact → address → delivery method → review), and
`/:slug/orders/:orderId` (order confirmation). Delivery methods default to
Pickup (free) / Standard (₦1,500) / Express (₦3,000), overridable per business
via `Business.deliveryConfig.methods`.

Orders start in `status: "payment_pending"` — payment processing and the
dashboard order-management (status flows) arrive in Phase 8.

Session payload (access JWT): `sub`(userId), `role` (`business_user`/`customer`/`platform_admin`), `businessId?`, `businessRole?` (Owner/Staff), `permissions[]` resolved from `role_permissions`.

## Multi-tenancy pattern

Every tenant-scoped query runs inside a tenant context provided by
`src/lib/tenant.ts` (AsyncLocalStorage) and is wired into API routes via the
`withTenant` wrapper in `src/lib/withTenant.ts`. On each request, tenant
resolution (`resolveTenantFromRequest`) verifies the JWT **and re-checks DB
membership + permissions** (`user.isActive`, `businessStaff.isActive`), so a
suspended user is rejected immediately even with a valid token â€” no Redis
needed for near-instant revocation.

To require authentication on a route, use the `requireAuthHandler` wrapper or
call `requireAuth()` inside a `withTenant`-wrapped handler.

## Auth strategy status

- **Interim (current)**: stateless JWT in HttpOnly cookies. Access tokens are
  short-lived (15m); refresh tokens rotate (30d). No server-side session store.
- **Final (planned)**: Redis-backed session store for instant revocation and
  force-logout. Until then, DB-level checks in `resolveSession` provide the
  revocation guarantees.
- **2FA**: deferred to a later phase (Business Owner / Super Admin only).

## Project structure

```
prisma/
  schema.prisma            # models (User, Business, BusinessStaff, Role, Permission, RolePermission,
                           #   Category, Product, ProductImage, ProductVariant, InventoryTransaction,
                           #   Cart, CartItem, Order, OrderItem, OrderStatusHistory)
  migrations/              # versioned SQL migrations
  seed.ts                  # system roles/permissions
scripts/
  verify-phase2.ts         # headless core auth integration test
  verify-http.mjs          # HTTP E2E auth test
  verify-dashboard.mjs     # Phase 4 dashboard shell E2E
  verify-products.mjs      # Phase 5 catalog/inventory/tenant-isolation E2E
  verify-storefront.mjs    # Phase 6 storefront E2E (tenant-by-slug, theme, filters)
  verify-checkout.mjs      # Phase 7 guest cart + checkout E2E (cookie, order/stock/isolation)
src/
  app/
    layout.tsx             # root layout (design tokens applied globally)
    page.tsx               # landing page
    (storefront)/          # tenant storefront group (home, products, product detail, cart, checkout, orders)
    (onboarding)/          # guided business onboarding (Phase 3)
    (dashboard)/           # dashboard group (auth-aware nav)
      products/            # All Products, Add/Edit, Categories, Inventory
      sales/orders/        # order list (read-only) (Phase 7)
    api/
      auth/                # register, login, logout, refresh, forgot/reset-password, me
      businesses/          # onboarding: me, complete, upload, check/suggest-slug
      categories/          # category list/create + [id] update/delete (Phase 5)
      products/            # product list/create + [id] update/delete (Phase 5)
      inventory/           # stock levels + adjustments (Phase 5)
      store/[slug]/        # cart + checkout (Phase 7)
      uploads/product/     # product image upload (Phase 5)
      health/route.ts      # health check
  lib/
    prisma.ts              # Prisma client (dev hot-reload safe)
    tenant.ts              # AsyncLocalStorage tenant context + requireAuth/requirePermission
    withTenant.ts          # withTenant / requireAuthHandler route wrappers
    http.ts                # JSON response helpers
    validate.ts            # lightweight input validation
    business.ts            # current-business + onboarding helpers
    dashboard.ts           # dashboard access resolve + onboarding guard
    dashboard-nav.ts       # permission-filtered dashboard navigation
    catalog.ts             # product/category/inventory server helpers (Phase 5)
    storefront.ts          # public storefront tenant resolution + queries (Phase 6)
    cart.ts                # guest cart cookie + CRUD helpers (Phase 7)
    order.ts               # delivery methods, placeOrder transaction, order view (Phase 7)
    format.ts              # display helpers (₦ price formatting, discount %)
    storage.ts             # local disk file storage (logos/banners/product images)
    auth/                  # password, jwt, session, permissions
```

## Known limitations

- **File uploads use LOCAL disk storage** (`public/uploads/`). Logo/banner
  uploads from onboarding (Step 4) write to the local filesystem and are served
  statically by Next. This works in dev and with `next start`, **but Cloudflare
  Workers has no writable filesystem at runtime**, so this MUST move to R2/S3
  object storage before any Workers deployment. It is flagged here (and in
  `src/lib/storage.ts` + `.env.example`) so it is not forgotten; revisit before
  Phase 8 (payments) and the deployment phase.

## Deployment notes (future)

The API must NOT be forced onto Workers alone because it needs direct
long-lived Postgres access; plan for the API to run alongside or behind the
Workers deployment (Phase 3+). JWT usage via `jose` keeps token verify
edge-compatible; DB access should use the standard `pg`-backed Prisma client on
a normal Node runtime.