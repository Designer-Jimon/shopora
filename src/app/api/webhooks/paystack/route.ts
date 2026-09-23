// SHOPORA — /api/webhooks/paystack
//   POST — Paystack webhooks cover BOTH billing surfaces:
//
//   A) ORDER payments on a store's OWN connected Paystack account. Verified
//      against the store's stored secret; charge.success settles the order.
//   B) SUBSCRIPTION billing on the PLATFORM account (native Paystack
//      Subscriptions, Phase 11). Verified against the platform key
//      (PAYSTACK_SECRET_KEY, with an optional PAYSTACK_WEBHOOK_SECRET
//      fallback). subscription.create / invoice.payment_failed /
//      subscription.disable / charge.success drive the Subscription row.
//
//   Idempotency: the WebhookEvent ledger keyed (event, eventId) drops any
//   replay BEFORE it touches state, and the subscription/order apply paths
//   additionally guard on (provider, providerRef). Uses the RAW body for HMAC
//   (x-paystack-signature) exactly as Paystack signs it.
//
//   Unknown references + valid signature acknowledge (200) so Paystack stops
//   retrying; malformed/signature failures bounce with 4xx.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { PaystackProvider } from '@/lib/payments/paystack';
import { getProviderSecret } from '@/lib/payments/secret';
import { recordGatewayPaymentSuccess } from '@/lib/payments/orders';
import { isSubscriptionRef } from '@/lib/payments/subscription';
import { PAYMENT_PROVIDERS } from '@/lib/payments/types';
import {
  handleNativeWebhook,
  isNativeSubscriptionEvent,
  verifyPlatformWebhook,
} from '@/lib/subscriptions/webhooks';

const provider = new PaystackProvider(null);

type LedgerResult = { received: true; handled?: string; duplicate?: boolean };

/** Wrap processing in the (event, eventId) ledger: replay → ack duplicate;
 * transient failure → roll the ledger row back and 500 so Paystack retries. */
async function ackWithLedger(
  event: string,
  eventId: string,
  processFn: () => Promise<{ handled: string }>,
): Promise<Response> {
  if (!eventId) {
    const result = await processFn().catch(() => ({ handled: 'error' }));
    return jsonOk({ received: true, handled: result.handled });
  }

  try {
    await prisma.webhookEvent.create({ data: { event, eventId, provider: 'paystack' } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return jsonOk({ received: true, duplicate: true } satisfies LedgerResult);
    }
    return jsonError('Webhook processing failed', 500);
  }

  try {
    const result = await processFn();
    return jsonOk({ received: true, handled: result.handled } satisfies LedgerResult);
  } catch {
    await prisma.webhookEvent
      .deleteMany({ where: { event, eventId } })
      .catch(() => undefined);
    return jsonError('Webhook processing failed', 500);
  }
}

export const POST = async (request: NextRequest): Promise<Response> => {
  const rawBody = await request.text().catch(() => '');
  const signature = request.headers.get('x-paystack-signature');

  const parsed = provider.parseWebhook(rawBody);
  if (!parsed) return jsonError('Malformed Paystack webhook payload', 400);
  if (!signature) return jsonError('Missing x-paystack-signature header', 403);

  const { event, providerRef, data } = parsed;
  const eventId = String(data?.id ?? '');

  // Resolve a pre-recorded transaction by reference (order charges + the
  // initial charge of a native subscription, which we pre-record at checkout).
  const txn = providerRef
    ? await prisma.transaction.findFirst({
        where: { provider: PAYMENT_PROVIDERS.paystack, providerRef },
        select: { businessId: true, orderId: true, type: true },
      })
    : null;

  // Platform native-subscription billing?
  const native =
    isNativeSubscriptionEvent(event, data) ||
    txn?.type === 'subscription' ||
    isSubscriptionRef(providerRef);

  if (native) {
    if (!verifyPlatformWebhook(rawBody, signature)) {
      return jsonError('Invalid Paystack webhook signature', 403);
    }
    return ackWithLedger(event, eventId, () =>
      handleNativeWebhook(event, data, {
        providerRef,
        preRecordedTxn: txn ? { businessId: txn.businessId, type: txn.type } : null,
      }),
    );
  }

  // ORDER payments — the store's own connected Paystack account.
  if (!txn || !txn.orderId) {
    return jsonOk({ received: true, handled: 'unknown_reference' });
  }
  const secret = await getProviderSecret(txn.businessId, PAYMENT_PROVIDERS.paystack);
  if (!secret || !provider.verifyWebhookSignature(rawBody, signature, secret)) {
    return jsonError('Invalid Paystack webhook signature', 403);
  }

  if (event === 'charge.success') {
    const amountKobo = Number(data?.amount ?? 0);
    await recordGatewayPaymentSuccess({
      businessId: txn.businessId,
      orderId: txn.orderId,
      provider: PAYMENT_PROVIDERS.paystack,
      providerRef,
      amount: Number.isFinite(amountKobo) ? amountKobo / 100 : 0,
    });
  }
  // charge.failed / abandoned: left for the return-route verification; no
  // order flip needed.

  return jsonOk({ received: true });
};