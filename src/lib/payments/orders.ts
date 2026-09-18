// SHOPORA order payment helpers — the ONLY place Order status flips to `paid`.
// Used by (a) the Paystack webhook, (b) the Paystack return-verification route,
// and (c) the dashboard's manual "mark as paid" for non-gateway methods.
//
// Idempotency: (provider, providerRef) is UNIQUE on Transaction, and order-level
// success is guarded inside a transaction, so replayed webhooks / double-clicks
// can never double-process.

import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { ORDER_STATUSES } from '@/lib/order';

export const TX_STATUSES = {
  initiated: 'initiated',
  success: 'success',
  failed: 'failed',
  pending: 'pending',
} as const;

export type TxClient = Prisma.TransactionClient;

/**
 * Apply the `paid` outcome to an order inside the caller's transaction.
 * No-op when the order is already past payment_pending.
 */
async function applyPaidToOrder(tx: TxClient, orderId: string, note: string): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { status: true, paymentMethod: true, total: true },
  });
  if (!order) return;
  if (order.status !== ORDER_STATUSES.paymentPending) return; // already paid/further along

  await tx.order.update({
    where: { id: orderId },
    data: { status: ORDER_STATUSES.paid, paidAt: new Date() },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId,
      status: ORDER_STATUSES.paid,
      note: note || 'Payment received',
    },
  });
}

/**
 * Record a new gateway transaction in 'initiated' state (checkout time).
 * providerRef is the gateway's reference; a later webhook/verify flips it.
 */
export async function recordPaymentInitiation(input: {
  businessId: string;
  orderId: string;
  provider: string;
  providerRef: string;
  amount: number;
}): Promise<void> {
  await prisma.transaction.create({
    data: {
      businessId: input.businessId,
      orderId: input.orderId,
      provider: input.provider,
      providerRef: input.providerRef,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      status: TX_STATUSES.initiated,
      type: 'payment',
    },
  });
}

/**
 * Record a successful gateway payment (webhook / verified return).
 * `existingTransactionId` anchors idempotency: only the row we created at init
 * is flipped to success, and only once. Returns 'processed' or 'duplicate'.
 */
export async function recordGatewayPaymentSuccess(input: {
  businessId: string;
  orderId: string;
  provider: string;
  providerRef: string;
  amount: number;
  note?: string;
}): Promise<'processed' | 'duplicate'> {
  const { businessId, orderId, provider, providerRef, amount, note } = input;

  return prisma.$transaction(async (tx) => {
    const txn = await tx.transaction.findFirst({
      where: { businessId, provider, providerRef },
      orderBy: { createdAt: 'asc' },
    });
    if (!txn) return 'duplicate';

    // Guarded flip: only an non-success transaction can be flipped. A replayed
    // webhook hits count===0 and falls through as 'duplicate'.
    const flip = await tx.transaction.updateMany({
      where: { id: txn.id, status: { not: TX_STATUSES.success } },
      data: { status: TX_STATUSES.success },
    });
    if (flip.count === 0) return 'duplicate';

    await applyPaidToOrder(tx, orderId, note ?? `Payment received via ${provider}`);

    // Floor the linked amount at the gateway's reported value if the init-time
    // snapshot was 0/placeholder.
    if (Number(txn.amount) <= 0 && amount > 0) {
      await tx.transaction.update({ where: { id: txn.id }, data: { amount: new Prisma.Decimal(amount.toFixed(2)) } });
    }

    return 'processed';
  });
}

/**
 * Record a MANUAL payment (bank transfer / COD confirmed by the business).
 * One manual success transaction per order — skips cleanly on double-clicks.
 */
export async function recordManualPaymentSuccess(input: {
  businessId: string;
  orderId: string;
  amount: number;
  note?: string;
}): Promise<'processed' | 'duplicate'> {
  const { businessId, orderId, amount, note } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { businessId, orderId, provider: 'manual', status: TX_STATUSES.success },
    });
    if (existing) return 'duplicate';

    await tx.transaction.create({
      data: {
        businessId,
        orderId,
        provider: 'manual',
        providerRef: null,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        status: TX_STATUSES.success,
        type: 'payment',
      },
    });
    await applyPaidToOrder(tx, orderId, note ?? 'Payment confirmed manually by business');
    return 'processed';
  });
}

/**
 * Transition an order's fulfillment status from the dashboard. Moving OUT of
 * payment_pending to any paid-fulfillment status implies the money is in, so we
 * write the manual transaction + paidAt alongside (idempotently). Cancelling an
 * unpaid order is allowed without payment.
 */
export async function transitionOrderStatus(input: {
  businessId: string;
  orderId: string;
  newStatus: string;
  note?: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const { businessId, orderId, newStatus, note } = input;

  const allowed: string[] = Object.values(ORDER_STATUSES);
  if (!allowed.includes(newStatus)) return { ok: false, error: `Status must be one of: ${allowed.join(', ')}` };

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, businessId } });
    if (!order) return { ok: false as const, error: 'Order not found' };
    if (order.status === newStatus) return { ok: true as const, status: order.status };
    if (order.status === ORDER_STATUSES.delivered) {
      return { ok: false as const, error: 'A delivered order cannot change status' };
    }

    await tx.orderStatusHistory.create({
      data: { orderId, status: newStatus, note: note?.trim() || null },
    });
    await tx.order.update({ where: { id: order.id }, data: { status: newStatus } });

    // Payment side-effects when leaving payment_pending toward a fulfilment state.
    if (order.status === ORDER_STATUSES.paymentPending && newStatus !== ORDER_STATUSES.cancelled) {
      await tx.order.update({ where: { id: order.id }, data: { paidAt: new Date() } });
      const manualAlready = await tx.transaction.findFirst({
        where: { businessId, orderId: order.id, provider: 'manual', status: TX_STATUSES.success },
      });
      if (!manualAlready && newStatus !== ORDER_STATUSES.paymentPending) {
        await tx.transaction.create({
          data: {
            businessId,
            orderId: order.id,
            provider: 'manual',
            providerRef: null,
            amount: order.total,
            status: TX_STATUSES.success,
            type: 'payment',
          },
        });
      }
    }

    return { ok: true as const, status: newStatus };
  });
}