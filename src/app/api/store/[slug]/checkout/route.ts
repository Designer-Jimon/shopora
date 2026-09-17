// SHOPORA — /api/store/[slug]/checkout
//   POST — place an order from the session cart. Public (guests included):
//   the cart session cookie is the identity. payment_pending order; payment
//   arrives in Phase 8.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, jsonCreated, authErrors } from '@/lib/http';
import { getTenantContext } from '@/lib/tenant';
import { withTenant } from '@/lib/withTenant';
import { readCartSessionId, resolveCartBusiness } from '@/lib/cart';
import { placeOrder, type DeliveryAddress } from '@/lib/order';

export const POST = withTenant(async (request: NextRequest, ctx) => {
  const { slug } = (ctx as { params?: { slug?: string } }).params ?? {};
  if (!slug) return jsonError('Slug required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  const sessionId = readCartSessionId(request);
  if (!sessionId) return authErrors.badRequest('Your cart is empty');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const deliveryAddressRaw = body.deliveryAddress as Record<string, unknown> | null | undefined;
  const deliveryAddress: DeliveryAddress | null =
    deliveryAddressRaw && typeof deliveryAddressRaw === 'object'
      ? {
          state: String(deliveryAddressRaw.state ?? ''),
          city: String(deliveryAddressRaw.city ?? ''),
          address: String(deliveryAddressRaw.address ?? ''),
          landmark: deliveryAddressRaw.landmark ? String(deliveryAddressRaw.landmark) : null,
        }
      : null;

  const tenant = getTenantContext();

  const result = await placeOrder({
    businessId: biz.id,
    sessionId,
    userId: tenant?.authenticated ? tenant.userId : null,
    customerName: typeof body.name === 'string' ? body.name : '',
    customerEmail: typeof body.email === 'string' ? body.email : '',
    customerPhone: typeof body.phone === 'string' && body.phone ? body.phone : null,
    deliveryMethodId: typeof body.deliveryMethod === 'string' ? body.deliveryMethod : '',
    deliveryConfig: biz.deliveryConfig,
    deliveryAddress,
    notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
  });

  if (!result.ok) {
    if (result.fieldErrors) {
      return jsonError(result.error ?? 'Checkout failed', 422);
    }
    return jsonError(result.error ?? 'Checkout failed', 400);
  }

  return jsonCreated({
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    total: result.total,
    redirectTo: `/${slug}/orders/${result.orderId}`,
  });
});