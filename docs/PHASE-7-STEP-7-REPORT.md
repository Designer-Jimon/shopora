# Phase 7 — Shopping Cart & Checkout: STEP 7 Report

**Status: COMPLETE** · All suites pass · Typecheck clean

## 1. What was built

The guest cart + checkout flow behind the two Phase 6 stub buttons on every
product (Add to cart / Buy now), plus order persistence, stock-safe
decrementing, and a read-only order list for business owners.

### Schema (2 migrations)
- `20260916223501_phase7_cart_orders` — new models **Cart**, **CartItem**,
  **Order**, **OrderItem**, **OrderStatusHistory**; relations added to
  User/Business/Product/ProductVariant; `Business.deliveryConfig` JSON field.
- `20260916230421_phase7_add_order_number` — `Order.orderNumber` (per-business
  sequential, e.g. `0001`).

### Server libs
- `src/lib/cart.ts` — `shopora_cart_session` cookie helpers, `CartView`
  serializer (price snapshots incl. discounts, per-line stock, subtotal +
  discount totals), and CRUD mutations (`addToCart`, `updateCartItemQuantity`,
  `removeCartItem`) — every query scoped by `businessId`.
- `src/lib/order.ts` — `getDeliveryMethods` (default Pickup ₦0 / Standard
  ₦1,500 / Express ₦3,000, per-business overridable via deliveryConfig),
  `placeOrder` (single transaction), `getOrderView`.

### API routes (all public — guest checkout)
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/store/[slug]/cart` | Read the session cart |
| POST | `/api/store/[slug]/cart` | Add item; merges same product+variant; sets cookie on first add |
| PATCH | `/api/store/[slug]/cart` | Update a line's quantity (capped at stock) |
| DELETE | `/api/store/[slug]/cart/[itemId]` | Remove a line |
| POST | `/api/store/[slug]/checkout` | Place the order (validates + decrements stock, empties cart) |

Checkout (`placeOrder`) runs in one Prisma `$transaction`:
1. reload cart lines with live price/stock; reject inactive/missing products;
2. validate each line against available stock;
3. decrement stock atomically via `updateMany({ stockQuantity: { gte: qty } })`
   (zero output count → throw);
4. write one `InventoryTransaction` per line (`reason: "sale"`, negative qty);
5. create `Order` (status `payment_pending`, per-business `orderNumber`) +
   `OrderItem` snapshots (`productName`, `variantLabel`, `unitPrice`, `total`) +
   `OrderStatusHistory`;
6. empty the cart.

### Storefront pages
- `/:slug/cart` — line items with quantity steppers, remove, order summary,
  discount line. Server-rendered initial state + client hydration.
- `/:slug/checkout` — 4-step wizard (Contact → Delivery → Method → Review);
  delivery-fee-aware totals; final POST hits the checkout API then redirects to
  the confirmation page. Empty cart → `redirect(/cart)`.
- `/:slug/orders/:orderId` — order confirmation (items, totals, delivery,
  status timeline placeholder, "awaiting payment" notice).
- Header cart badge with live count (server-rendered from the layout via
  `cookies()` + `getCartCount`).
- `BuyPanel.tsx` — both buttons now call the real API; "Buy now" adds then jumps
  straight to checkout.

### Dashboard
- `/sales/orders` — replaced the Phase 4 stub with a real (read-only) order
  list: order number, customer, status badge, total, date. Gated by
  `requireDashboardAccess()`.

## 2. Security & tenant isolation

- **Tenant scope**: every cart/order query carries `businessId` resolved from
  the URL slug (never client input). Carts are uniquely keyed
  `(businessId, sessionId)` → the same cookie in two stores yields two
  independent carts.
- **Guest identity**: random 24-byte session id in an httpOnly, SameSite=Lax,
  30-day cookie. No PII until checkout.
- **Stock safety**: no code path can move stock below zero; checkout re-verifies
  stock in the same transaction that decrements it (no TOCTOU).
- **Order create guards**: validates email format + required delivery address
  when the method isn't pickup; unknown method → 400; empty/no cookie → 400.
- **Snapshot integrity**: order totals/line prices are decimals computed from
  live prices at checkout; `OrderItem` stores names so future product edits
  don't corrupt history.
- **No secrets/logging of customer data** beyond what's needed for fulfilment.

## 3. Files

**Modified (8):** `README.md`, `package.json`, `prisma/schema.prisma`,
`prisma/migrations/migration_lock.toml`,
`src/app/(dashboard)/sales/orders/page.tsx`,
`src/app/(storefront)/[slug]/layout.tsx` (cart badge),
`src/app/(storefront)/[slug]/products/[productSlug]/page.tsx` (passes
`slug`), `src/app/(storefront)/_components/BuyPanel.tsx` (live cart calls).

**Added:** 2 migrations, `src/lib/cart.ts`, `src/lib/order.ts`,
`src/app/api/store/[slug]/cart/route.ts`,
`src/app/api/store/[slug]/cart/[itemId]/route.ts`,
`src/app/api/store/[slug]/checkout/route.ts`,
`src/app/(storefront)/[slug]/cart/page.tsx`,
`src/app/(storefront)/[slug]/checkout/page.tsx`,
`src/app/(storefront)/[slug]/orders/[orderId]/page.tsx`,
`src/app/(storefront)/_components/CartPanel.tsx`,
`src/app/(storefront)/_components/CheckoutForm.tsx`,
`scripts/verify-checkout.mjs`.

## 4. Tests

**New `test:checkout`** (`npm run test:checkout`) — **ALL PASSED (47 asserts)**:
cookie lifecycle (set on first add, persists across requests), merge same
product+variant, per-line discounts + subtotal/discount totals, quantity PATCH
(+cap at stock), DELETE line, tenant isolation (same cookie, two stores →
separate carts), checkout (pickup = free, standard = ₦1,500) with order number
`0001` per store, item snapshots, `OrderStatusHistory` row, stock decrement
(6→2 and 8→7), `InventoryTransaction` rows written, cart emptied, confirmation
page + dashboard orders render, over-stock rejection, empty-cart rejection,
no-session rejection, unknown-store 404, product/cart/checkout page surfaces.

**Regressions — all green:**
- `test:storefront` — ALL PHASE 6 CHECKS PASSED
- `test:products` — ALL PHASE 5 CHECKS PASSED
- `test:auth-pages` — ALL AUTH-PAGE CHECKS PASSED
- `test:dashboard` — ALL PHASE 4 CHECKS PASSED
- `test:core` (phase 2, tsx) — ALL CHECKS PASSED
- `test:api` — ALL HTTP CHECKS PASSED
- `npx tsc --noEmit` — clean

## 5. Notes / scope decisions

- **No payment** — orders land in `payment_pending`; the UI states payment
  happens at delivery/pickup. Phase 8 handles gateways + status transitions.
- **No customer account merge** — `Cart.userId` is set when a logged-in
  customer checks out (order history lookup), but guest→account cart merging is
  left for a later phase.
- **Order confirmation URL is the token** — `/:slug/orders/:orderId` is
  unauthenticated (like a receipt link) guarded by an unguessable cuid; "my
  orders" account view is a later phase.
- **Delivery config** — method fees default to constants; a business can
  override via `Business.deliveryConfig.methods` (already read by
  `getDeliveryMethods`).
- **Dashboard order management** (status transitions, filters) is Phase 8+;
  this phase delivers read visibility only.

## 6. NEXT (candidate)

Phase 8 payment setup. Recommend: pick a gateway (Paystack/Payaza/Flutterwave),
seed a `Payment`/`SubscriptionPlan` table, wire order status flows on the
dashboard, and add customer "my orders" pages.