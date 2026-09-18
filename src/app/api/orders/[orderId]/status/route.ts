// SHOPORA — /api/orders/[orderId]/status
//   PATCH — transition an order to a new status. `orders.write` required.
//   Moving out of payment_pending toward fulfilment records the manual
//   payment (bank transfer / COD) idempotently and stamps paidAt.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { transitionOrderStatus } from '@/lib/payments/orders';

export const PATCH = requireAuthHandler(
  async (request: NextRequest, context: unknown) => {
    const ctxTenant = requirePermission('orders.write');
    const orderId = (context as { params?: { orderId?: string } } | undefined)?.params?.orderId;
    if (!orderId) return authErrors.badRequest('Order id required');
    if (!ctxTenant.businessId) return authErrors.forbidden();

    const body = await request.json().catch(() => null);
    if (!body) return authErrors.badRequest('Invalid JSON body');
    const newStatus = String(body.status ?? '');

    const result = await transitionOrderStatus({
      businessId: ctxTenant.businessId,
      orderId,
      newStatus,
      note: typeof body.note === 'string' ? body.note : undefined,
    });

    if (!result.ok) return jsonError(result.error, 422);
    return jsonOk({ status: result.status });
  },
);