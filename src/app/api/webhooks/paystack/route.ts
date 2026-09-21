// SHOPORA — /api/webhooks/paystack
//   POST — Paystack sends charge.success / charge.failed here.
//   Public (no session) but guarded by HMAC-SHA512 signature of the RAW body
//   (x-paystack-signature) vs the business's stored Paystack secret for order
//   payments, or vs the PLATFORM Paystack secret (env PAYSTACK_SECRET_KEY) for
//   subscription payments (SP-SUB-* references, Transaction.orderId = null).
//   Idempotent: (provider, providerRef) is unique on Transaction and both the
//   order and subscription success paths are guarded, so replays are safe.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import prisma from '@/lib/prisma';
import { PaystackProvider } from '@/lib/payments/paystack';
import { getProviderSecret } from '@/lib/payments/secret';
import { recordGatewayPaymentSuccess } from '@/lib/payments/orders';
import {
  applySubscriptionPaymentSuccess,
  getPlatformPaystackSecret,
  isSubscriptionRef,
} from '@/lib/payments/subscription';
import { PAYMENT_PROVIDERS } from '@/lib/payments/types';

const provider = new PaystackProvider(null); // secret fetched per-flavor below

const camel = (data: Record<string, unknown> | undefined, key: string): string | null => {
  const v = data?.[key];
  return typeof v === 'string' && v ? v : null;
};

export const POST = async (request: NextRequest): Promise<Response> => {
  const rawBody = await request.text().catch(() => '');
  const signature = request.headers.get('x-paystack-signature');

  const parsed = provider.parseWebhook(rawBody);
  if (!parsed) return jsonError('Malformed Paystack webhook payload', 400);
  if (!signature) return jsonError('Missing x-paystack-signature header', 403);

  // Identify the owning business via the referenced transaction.
  const txn = await prisma.transaction.findFirst({
    where: { provider: PAYMENT_PROVIDERS.paystack, providerRef: parsed.providerRef },
    select: { businessId: true, orderId: true, type: true },
  });

  // Unknown/uninitiated reference — acknowledge (Paystack retries otherwise).
  if (!txn) return jsonOk({ received: true, handled: 'unknown_reference' });

  // Subscription payments are collected on the PLATFORM's Paystack account, so
  // their signature verifies against the platform key, not the store's key.
  if (txn.type === 'subscription' || isSubscriptionRef(parsed.providerRef)) {
    const secret = getPlatformPaystackSecret();
    if (!secret || !provider.verifyWebhookSignature(rawBody, signature, secret)) {
      return jsonError('Invalid Paystack webhook signature', 403);
    }
    if (parsed.event === 'charge.success') {
      const amountKobo = Number(parsed.data?.amount ?? 0);
      const auth = parsed.data?.authorization as Record<string, unknown> | undefined;
      const customer = parsed.data?.customer as Record<string, unknown> | undefined;
      await applySubscriptionPaymentSuccess({
        businessId: txn.businessId,
        providerRef: parsed.providerRef,
        amount: Number.isFinite(amountKobo) ? amountKobo / 100 : 0,
        authorizationCode: camel(auth, 'authorization_code'),
        customerCode: camel(customer, 'customer_code'),
      });
    }
    return jsonOk({ received: true });
  }

  if (!txn.orderId) return jsonOk({ received: true, handled: 'unknown_reference' });

  const secret = await getProviderSecret(txn.businessId, PAYMENT_PROVIDERS.paystack);
  if (!secret || !provider.verifyWebhookSignature(rawBody, signature, secret)) {
    return jsonError('Invalid Paystack webhook signature', 403);
  }

  if (parsed.event === 'charge.success') {
    const amountKobo = Number(parsed.data?.amount ?? 0);
    await recordGatewayPaymentSuccess({
      businessId: txn.businessId,
      orderId: txn.orderId,
      provider: PAYMENT_PROVIDERS.paystack,
      providerRef: parsed.providerRef,
      amount: Number.isFinite(amountKobo) ? amountKobo / 100 : 0,
    });
  }
  // charge.failed / abandoned: leave the initiated transaction to be cleaned
  // up by the return-route verification; no order flip needed.

  return jsonOk({ received: true });
};