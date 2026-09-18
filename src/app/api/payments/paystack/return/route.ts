// SHOPORA — /api/payments/paystack/return
//   GET — Paystack bounces the customer back here after hosted checkout
//   (?trxref plus our orderId query param). We verify SERVER-SIDE with the
//   gateway (never trust the client bounce), record success idempotently,
//   then redirect to the order page. Public redirect endpoint.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getConnectedProvider } from '@/lib/payments';
import { recordGatewayPaymentSuccess } from '@/lib/payments/orders';
import { PAYMENT_PROVIDERS } from '@/lib/payments/types';

export const GET = async (request: NextRequest): Promise<Response> => {
  const orderId = request.nextUrl.searchParams.get('orderId');
  if (!orderId) return NextResponse.redirect(request.nextUrl.origin);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, businessId: true, orderNumber: true, total: true },
  });
  if (!order) return NextResponse.redirect(request.nextUrl.origin);

  const orderUrl = `/orders/${order.id}`;
  const { slug } = await prisma.business
    .findUnique({ where: { id: order.businessId }, select: { slug: true } })
    .then((b) => (b ? { slug: b.slug } : { slug: null }));
  const base = request.nextUrl.origin;
  const redirectTo = slug ? `${base}/${slug}/orders/${order.id}` : `${base}${orderUrl}`;

  const { connected, provider } = await getConnectedProvider(order.businessId, PAYMENT_PROVIDERS.paystack);
  if (!connected || !provider) {
    return NextResponse.redirect(new URL(`${redirectTo}?payment=unavailable`, request.nextUrl.origin));
  }

  // Find the reference this order initiated (latest paystack txn).
  const txn = await prisma.transaction.findFirst({
    where: { businessId: order.businessId, orderId: order.id, provider: PAYMENT_PROVIDERS.paystack },
    orderBy: { createdAt: 'desc' },
  });
  if (!txn?.providerRef) {
    return NextResponse.redirect(new URL(`${redirectTo}?payment=unavailable`, request.nextUrl.origin));
  }

  const verified = await provider.verifyTransaction(txn.providerRef);
  const outcome =
    verified.status === 'success'
      ? 'paid'
      : verified.status === 'failed'
        ? 'failed'
        : 'pending';

  if (verified.status === 'success') {
    await recordGatewayPaymentSuccess({
      businessId: order.businessId,
      orderId: order.id,
      provider: PAYMENT_PROVIDERS.paystack,
      providerRef: verified.providerRef,
      amount: verified.amountPaid ?? Number(order.total),
    });
  }

  return NextResponse.redirect(new URL(`${redirectTo}?payment=${outcome}`, request.nextUrl.origin));
};