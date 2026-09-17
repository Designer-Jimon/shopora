// SHOPORA — /api/store/[slug]/cart
//   GET   — read the session cart (public, no auth required)
//   POST  — add an item to the cart (creates session + cookie if needed)
//   PATCH — update the quantity of an existing cart item

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, jsonCreated, authErrors } from '@/lib/http';
import { getTenantContext } from '@/lib/tenant';
import { withTenant } from '@/lib/withTenant';
import {
  addToCart,
  emptyCartView,
  findCart,
  getCartView,
  newSessionId,
  readCartSessionId,
  resolveCartBusiness,
  setCartCookie,
  updateCartItemQuantity,
  MAX_LINE_QUANTITY,
} from '@/lib/cart';

export const GET = withTenant(async (request: NextRequest, ctx) => {
  const { slug } = (ctx as { params?: { slug?: string } }).params ?? {};
  if (!slug) return jsonError('Slug required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  const sessionId = readCartSessionId(request);
  if (!sessionId) {
    return jsonOk(emptyCartView(biz.id, ''));
  }

  const cart = await findCart(biz.id, sessionId);
  if (!cart) return jsonOk(emptyCartView(biz.id, sessionId));

  return jsonOk(await getCartView(cart));
});

export const POST = withTenant(async (request: NextRequest, ctx) => {
  const { slug } = (ctx as { params?: { slug?: string } }).params ?? {};
  if (!slug) return jsonError('Slug required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const productId = typeof body.productId === 'string' ? body.productId : '';
  const variantId = typeof body.variantId === 'string' && body.variantId ? body.variantId : null;
  const quantity = Number(body.quantity ?? 1);

  if (!productId) return authErrors.badRequest('productId is required');
  if (quantity !== Math.floor(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return authErrors.badRequest(`quantity must be 1–${MAX_LINE_QUANTITY}`);
  }

  const tenant = getTenantContext();
  const sessionId = readCartSessionId(request) ?? newSessionId();

  const result = await addToCart({
    businessId: biz.id,
    sessionId,
    userId: tenant?.authenticated ? tenant.userId : null,
    productId,
    variantId,
    quantity,
  });

  if (!result.ok) return jsonError(result.error ?? 'Could not add to cart', 400);

  const response = jsonCreated({ cart: result.cart });
  if (!readCartSessionId(request)) {
    setCartCookie(response, sessionId);
  }
  return response;
});

export const PATCH = withTenant(async (request: NextRequest, ctx) => {
  const { slug } = (ctx as { params?: { slug?: string } }).params ?? {};
  if (!slug) return jsonError('Slug required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  const sessionId = readCartSessionId(request);
  if (!sessionId) return authErrors.badRequest('No cart session');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const itemId = typeof body.itemId === 'string' ? body.itemId : '';
  const quantity = Number(body.quantity);

  if (!itemId) return authErrors.badRequest('itemId is required');
  if (quantity !== Math.floor(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return authErrors.badRequest(`quantity must be 1–${MAX_LINE_QUANTITY}`);
  }

  const result = await updateCartItemQuantity(biz.id, sessionId, itemId, quantity);
  if (!result.ok) return jsonError(result.error ?? 'Could not update quantity', 400);

  return jsonOk({ cart: result.cart });
});