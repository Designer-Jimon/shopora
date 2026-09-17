// SHOPORA — /api/store/[slug]/cart/[itemId]
//   DELETE — remove a line item from the session cart

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withTenant } from '@/lib/withTenant';
import {
  readCartSessionId,
  removeCartItem,
  resolveCartBusiness,
} from '@/lib/cart';

export const DELETE = withTenant(async (request: NextRequest, ctx) => {
  const { slug, itemId } = (ctx as { params?: { slug?: string; itemId?: string } }).params ?? {};
  if (!slug || !itemId) return jsonError('Slug and itemId required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  const sessionId = readCartSessionId(request);
  if (!sessionId) return authErrors.badRequest('No cart session');

  const result = await removeCartItem(biz.id, sessionId, itemId);
  if (!result.ok) return jsonError(result.error ?? 'Could not remove item', 400);

  return jsonOk({ cart: result.cart });
});