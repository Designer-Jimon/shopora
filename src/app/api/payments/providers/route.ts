// SHOPORA — /api/payments/providers
//   GET    — list connected payment providers for this business (NO secrets)
//   PUT    — connect/update a provider (public + secret key)
//   DELETE — disconnect a provider (drops the stored secret)

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, jsonNoContent, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { saveProviderSecret, deleteProviderSecret } from '@/lib/payments/secret';
import { PAYMENT_PROVIDERS } from '@/lib/payments/types';

const CONNECTABLE = [PAYMENT_PROVIDERS.paystack];

export const GET = requireAuthHandler(async () => {
  const ctx = requirePermission('payments.manage');
  if (!ctx.businessId) return authErrors.forbidden();

  const rows = await prisma.paymentProvider.findMany({
    where: { businessId: ctx.businessId, provider: { in: CONNECTABLE } },
    orderBy: { createdAt: 'asc' },
  });

  return jsonOk(
    rows.map((r) => ({
      provider: r.provider,
      status: r.status,
      publicKey: r.provider === 'paystack' ? r.publicKey : r.publicKey,
      connectedAt: r.connectedAt,
    })),
  );
});

export const PUT = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requirePermission('payments.manage');
  if (!ctx.businessId) return authErrors.forbidden();

  const body = await request.json().catch(() => null);
  if (!body) return authErrors.badRequest('Invalid JSON body');

  const provider = String(body.provider ?? '');
  if (!CONNECTABLE.includes(provider as typeof CONNECTABLE[number])) {
    return jsonError(`Unknown provider. Must be one of: ${CONNECTABLE.join(', ')}`, 400);
  }
  const publicKey = typeof body.publicKey === 'string' && body.publicKey.trim() ? body.publicKey.trim() : null;
  const secretKey = typeof body.secretKey === 'string' && body.secretKey.trim() ? body.secretKey.trim() : null;
  if (!publicKey || !secretKey) {
    return jsonError('Both a public key and a secret key are required to connect.', 422);
  }
  if (secretKey.length < 10) {
    return jsonError('That secret key looks too short to be valid.', 422);
  }

  const existing = await prisma.paymentProvider.findUnique({
    where: { businessId_provider: { businessId: ctx.businessId, provider } },
  });

  const row = await prisma.paymentProvider.upsert({
    where: { businessId_provider: { businessId: ctx.businessId, provider } },
    update: {
      publicKey,
      status: 'connected',
      connectedAt: existing?.connectedAt ?? new Date(),
    },
    create: {
      businessId: ctx.businessId,
      provider,
      publicKey,
      status: 'connected',
      connectedAt: new Date(),
    },
  });

  await saveProviderSecret(row.id, secretKey);

  return jsonOk({
    provider: row.provider,
    status: row.status,
    publicKey: row.publicKey,
    connectedAt: row.connectedAt,
  });
});

export const DELETE = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requirePermission('payments.manage');
  if (!ctx.businessId) return authErrors.forbidden();

  const body = await request.json().catch(() => null);
  const provider = String(body?.provider ?? body?.provider ?? '');
  if (!CONNECTABLE.includes(provider as typeof CONNECTABLE[number])) {
    return jsonError(`Unknown provider. Must be one of: ${CONNECTABLE.join(', ')}`, 400);
  }

  const row = await prisma.paymentProvider.findUnique({
    where: { businessId_provider: { businessId: ctx.businessId, provider } },
  });
  if (!row) return jsonNoContent();

  await deleteProviderSecret(row.id);
  await prisma.paymentProvider.update({
    where: { id: row.id },
    data: { status: 'disconnected', publicKey: null, connectedAt: null },
  });

  return jsonNoContent();
});