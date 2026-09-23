// SHOPORA — /api/store/[slug]/checkout
//   POST — place an order from the session cart. Public (guests included):
//   the cart session cookie is the identity. payment_pending order; Phase 8:
//   when the store connected Paystack and the customer picked paystack we start
//   a hosted-checkout session and return its authorization_url (server-side,
//   secret never leaves the API). Other methods land payment_pending and are
//   marked paid manually by the business.

import { NextRequest } from 'next/server';
import { jsonError, jsonCreated, authErrors } from '@/lib/http';
import { getTenantContext } from '@/lib/tenant';
import { withTenant } from '@/lib/withTenant';
import { readCartSessionId, resolveCartBusiness } from '@/lib/cart';
import { placeOrder, type DeliveryAddress } from '@/lib/order';
import { getConnectedProvider } from '@/lib/payments';
import { recordPaymentInitiation } from '@/lib/payments/orders';
import { PAYMENT_METHODS } from '@/lib/payments/types';
import { getSubscriptionState, isCheckoutAllowed, ordersThisMonth } from '@/lib/subscriptions/state';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';

export const POST = withTenant(async (request: NextRequest, ctx) => {
  const { slug } = (ctx as { params?: { slug?: string } }).params ?? {};
  if (!slug) return jsonError('Slug required', 400);

  const biz = await resolveCartBusiness(slug);
  if (!biz) return authErrors.notFound('Store not found');

  const sub = await getSubscriptionState(biz.id);
  if (sub.status === SUBSCRIPTION_STATUSES.cancelled) return authErrors.notFound('Store not found');
  if (!isCheckoutAllowed(sub.status)) return jsonError('This store is temporarily unable to take orders — please try again later.', 423);

  // Phase 11 — monthly order cap from the plan (Free = 50/mo, Starter = 500/mo,
  // Growth = unlimited). Soft limit: excess orders are declined, the store
  // stays live.
  const orderCountThisMonth = await ordersThisMonth(biz.id);
  if (orderCountThisMonth >= sub.orderLimit) {
    return jsonError(
      `This store has reached its ${String(sub.orderLimit)}-order monthly limit on the ${sub.planDisplayName} plan. Please try again next month.`,
      423,
    );
  }

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

  const validMethods: string[] = [
    PAYMENT_METHODS.paystack,
    PAYMENT_METHODS.bankTransfer,
    PAYMENT_METHODS.cashOnDelivery,
  ];
  const paymentMethod =
    typeof body.paymentMethod === 'string' && validMethods.includes(body.paymentMethod)
      ? body.paymentMethod
      : PAYMENT_METHODS.bankTransfer;

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
    paymentMethod,
    notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
  });

  if (!result.ok) {
    if (result.fieldErrors) {
      return jsonError(result.error ?? 'Checkout failed', 422);
    }
    return jsonError(result.error ?? 'Checkout failed', 400);
  }

  const base: Record<string, unknown> = {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    total: result.total,
    paymentMethod,
    redirectTo: `/${slug}/orders/${result.orderId}`,
  };

  // Start a hosted-checkout session when the customer chose Paystack and the
  // store has it connected. Failure degrades gracefully: the order stays
  // payment_pending and the user is sent to its page to retry/pay manually.
  if (paymentMethod === PAYMENT_METHODS.paystack) {
    const { connected, provider } = await getConnectedProvider(biz.id, PAYMENT_METHODS.paystack);
    if (connected && provider) {
      const origin = request.nextUrl.origin;
      const init = await provider.initializeTransaction({
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        amount: result.total,
        email: typeof body.email === 'string' ? body.email : '',
        callbackUrl: `${origin}/api/payments/paystack/return?orderId=${result.orderId}`,
      });
      if (init.ok) {
        await recordPaymentInitiation({
          businessId: biz.id,
          orderId: result.orderId,
          provider: PAYMENT_METHODS.paystack,
          providerRef: init.providerRef,
          amount: result.total,
        });
        base.authorizationUrl = init.authorizationUrl;
      } else {
        base.paymentError = init.error;
      }
    } else {
      base.paymentError = 'Paystack is not connected on this store yet — pay on delivery or transfer instead.';
    }
  }

  return jsonCreated(base);
});