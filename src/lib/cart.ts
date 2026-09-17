// SHOPORA storefront cart server helpers.
//
// Carts are per-business and identified by a sessionId stored in the
// `shopora_cart_session` cookie (httpOnly, 30-day). Logged-in customers get
// their userId attached to the Cart row as a reference (order history lookup).
// Guests never hit an auth wall: the cookie is the identity.
//
// Tenant isolation: every query is scoped by the businessId resolved from the
// caller's slug (API routes) or the layout-resolved StorefrontBusiness.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Cart, CartItem, Product, ProductVariant } from '@prisma/client';

export const CART_COOKIE = 'shopora_cart_session';
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const MAX_LINE_QUANTITY = 50;

// ------------------------------------------------------------------
// Session cookie helpers
// ------------------------------------------------------------------

export function readCartSessionId(request: NextRequest): string | undefined {
  return request.cookies.get(CART_COOKIE)?.value;
}

/** Set (or refresh) the cart session cookie on a response. */
export function setCartCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(CART_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  });
  return response;
}

export function newSessionId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Public slug → active business (storefront cart/checkout routes). */
export async function resolveCartBusiness(slugRaw: string) {
  const slug = slugRaw.trim().toLowerCase();
  const biz = await prisma.business.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true, deliveryConfig: true },
  });
  return biz && biz.isActive ? biz : null;
}

// ------------------------------------------------------------------
// Cart queries
// ------------------------------------------------------------------

type CartItemRow = CartItem & {
  product: Pick<Product, 'id' | 'name' | 'slug' | 'price' | 'discountPrice' | 'status' | 'stockQuantity'> & {
    images?: { url: string; position: number }[];
  };
  variant: (Pick<ProductVariant, 'id' | 'color' | 'size' | 'priceOverride' | 'stockQuantity'> & { images?: never }) | null;
};

export type CartLine = {
  id: string;
  productId: string;
  productSlug: string;
  name: string;
  imageUrl: string | null;
  variantId: string | null;
  variantLabel: string | null;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  stock: number;
  lineTotal: number;
};

export type CartView = {
  sessionId: string;
  businessId: string;
  cartId: string;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  discountTotal: number;
  empty: boolean;
};

/** Effective per-unit price for a selection (variant override wins, then discount). Accepts Decimal or number. */
export function linePrice(
  product: { price: unknown; discountPrice: unknown },
  variant: { priceOverride: unknown } | null,
): { unit: number; original: number } {
  const base = Number(variant?.priceOverride ?? product.price);
  const discountRaw = product.discountPrice;
  const discount = discountRaw != null ? Math.min(Number(discountRaw), base) : base;
  return { unit: Number(discount), original: base };
}

const CART_ITEM_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      discountPrice: true,
      status: true,
    },
  },
  variant: {
    select: {
      id: true,
      color: true,
      size: true,
      priceOverride: true,
      stockQuantity: true,
    },
  },
} as const;

function cartItemToLine(item: CartItemRow): CartLine {
  const variantLabel =
    item.variant != null
      ? [item.variant.color, item.variant.size].filter(Boolean).join(' / ')
      : null;
  const { unit, original } = linePrice(item.product, item.variant);
  const stock = item.variant ? item.variant.stockQuantity : item.product.stockQuantity;
  const imageUrl =
    item.product.images
      ?.slice()
      .sort((a, b) => a.position - b.position)[0]?.url ?? null;
  return {
    id: item.id,
    productId: item.product.id,
    productSlug: item.product.slug,
    name: item.product.name,
    imageUrl,
    variantId: item.variantId,
    variantLabel,
    unitPrice: unit,
    originalPrice: original,
    quantity: item.quantity,
    stock,
    lineTotal: unit * item.quantity,
  };
}

export async function getCartView(cart: { id: string; sessionId: string; businessId: string }): Promise<CartView> {
  const items = await prisma.cartItem.findMany({
    where: { cartId: cart.id },
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          discountPrice: true,
          status: true,
          stockQuantity: true,
          images: { select: { url: true, position: true }, orderBy: { position: 'asc' } },
        },
      },
      variant: { select: { id: true, color: true, size: true, priceOverride: true, stockQuantity: true } },
    },
  });

  const lines = items.map(cartItemToLine);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const discountTotal = lines.reduce((s, l) => s + (l.originalPrice - l.unitPrice) * l.quantity, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  return {
    sessionId: cart.sessionId,
    businessId: cart.businessId,
    cartId: cart.id,
    items: lines,
    itemCount,
    subtotal,
    discountTotal,
    empty: lines.length === 0,
  };
}

/** Find an existing cart by (businessId, sessionId). */
export async function findCart(businessId: string, sessionId: string) {
  return prisma.cart.findUnique({ where: { businessId_sessionId: { businessId, sessionId } } });
}

/** Total quantity across a cart's lines (header badge + cart page). */
export async function getCartCount(businessId: string, sessionId: string): Promise<number> {
  const cart = await findCart(businessId, sessionId);
  if (!cart) return 0;
  const agg = await prisma.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

/** An empty cart view (no persisted cart yet). */
export function emptyCartView(businessId: string, sessionId: string): CartView {
  return {
    sessionId,
    businessId,
    cartId: '',
    items: [],
    itemCount: 0,
    subtotal: 0,
    discountTotal: 0,
    empty: true,
  };
}

// ------------------------------------------------------------------
// Mutations
// ------------------------------------------------------------------

export type AddToCartInput = {
  businessId: string;
  sessionId: string;
  userId?: string | null;
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export type AddToCartResult = {
  ok: boolean;
  error?: string;
  cart?: CartView;
};

/**
 * Add/merge an item into the cart. Validates the product belongs to the
 * business and is active. If the same product+variant is already in the cart
 * the quantity is merged (capped at MAX_LINE_QUANTITY).
 */
export async function addToCart(input: AddToCartInput): Promise<AddToCartResult> {
  const { businessId, sessionId, userId, productId, variantId, quantity } = input;

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Quantity must be between 1 and ${MAX_LINE_QUANTITY}` };
  }

  const product = await prisma.product.findFirst({ where: { id: productId, businessId }, select: { id: true, status: true } });
  if (!product) return { ok: false, error: 'Product not found' };
  if (product.status !== 'active') return { ok: false, error: 'This product is not available for purchase' };

  if (variantId) {
    const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!variant) return { ok: false, error: 'Variant not found' };
  }

  const cart = await prisma.cart.upsert({
    where: { businessId_sessionId: { businessId, sessionId } },
    update: { userId: userId ?? undefined },
    create: { businessId, sessionId, userId: userId ?? null },
  });

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, variantId: variantId ?? null },
  });

  let mergedQuantity: number;
  if (existing) {
    mergedQuantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + quantity);
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: mergedQuantity } });
  } else {
    mergedQuantity = Math.min(MAX_LINE_QUANTITY, quantity);
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, variantId: variantId ?? null, quantity: mergedQuantity },
    });
  }

  const view = await getCartView(cart);
  return { ok: true, cart: view };
}

export type UpdateCartItemResult = {
  ok: boolean;
  error?: string;
  cart?: CartView;
};

export async function updateCartItemQuantity(
  businessId: string,
  sessionId: string,
  itemId: string,
  quantity: number,
): Promise<UpdateCartItemResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: `Quantity must be between 1 and ${MAX_LINE_QUANTITY}` };
  }

  const cart = await findCart(businessId, sessionId);
  if (!cart) return { ok: false, error: 'Cart not found' };

  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) return { ok: false, error: 'Item not in cart' };

  const stockRow = item.variantId
    ? await prisma.productVariant.findUnique({ where: { id: item.variantId } })
    : await prisma.product.findUnique({ where: { id: item.productId } });
  const stock = stockRow?.stockQuantity ?? 0;
  if (quantity > stock) {
    return { ok: false, error: `Only ${stock} available` };
  }

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  const view = await getCartView(cart);
  return { ok: true, cart: view };
}

export async function removeCartItem(
  businessId: string,
  sessionId: string,
  itemId: string,
): Promise<{ ok: boolean; error?: string; cart?: CartView }> {
  const cart = await findCart(businessId, sessionId);
  if (!cart) return { ok: false, error: 'Cart not found' };

  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId: cart.id } });
  if (!item) return { ok: false, error: 'Item not in cart' };

  await prisma.cartItem.delete({ where: { id: item.id } });
  const view = await getCartView(cart);
  return { ok: true, cart: view };
}