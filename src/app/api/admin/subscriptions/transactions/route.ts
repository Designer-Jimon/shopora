// SHOPORA — GET /api/admin/subscriptions/transactions
// Payment/renewal history for subscription billing (Transaction.type =
// 'subscription', orderId null — SHOPORA's own platform Paystack revenue).
// ?status=&businessId=&page=&pageSize=

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const GET = withAdminHandler('platform.revenue.read', async (request: NextRequest) => {
  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? '';
  const businessId = url.searchParams.get('businessId') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const where: Record<string, unknown> = { type: 'subscription' };
  if (status) where.status = status;
  if (businessId) where.businessId = businessId;

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { business: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return jsonOk({
    transactions: rows.map((t) => ({
      id: t.id,
      provider: t.provider,
      providerRef: t.providerRef,
      amount: Number(t.amount),
      status: t.status,
      createdAt: t.createdAt,
      business: t.business,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});