// SHOPORA payment provider factory — turns a stored PaymentProvider row into a
// ready-to-use PaymentProvider instance with the business's secret key
// decrypted server-side. Callers degrade gracefully when the gateway isn't
// connected (fall back to manual payment methods).

import { PaymentProvider as ProviderRow } from '@prisma/client';
import prisma from '@/lib/prisma';
import { PaystackProvider } from './paystack';
import { getProviderSecret } from './secret';
import { PAYMENT_PROVIDERS, type PaymentProvider as IPaymentProvider } from './types';

export type ResolvedProvider = {
  connected: boolean;
  provider: IPaymentProvider | null;
};

export function buildProvider(name: string, secret: string | null): IPaymentProvider | null {
  if (name === PAYMENT_PROVIDERS.paystack) return new PaystackProvider(secret);
  return null; // Flutterwave etc. — not built yet (Phase 8 keeps the seam).
}

export function isGatewayConnected(row: ProviderRow | null): row is ProviderRow {
  return !!row && row.status === 'connected';
}

/** True when the business owns a connected gateway (used by checkout). */
export async function isPaymentGatewayConnected(businessId: string): Promise<boolean> {
  return prisma.paymentProvider
    .findFirst({
      where: { businessId, provider: PAYMENT_PROVIDERS.paystack, status: 'connected' },
      select: { id: true },
    })
    .then((row) => !!row);
}

/** Resolve a business's connected gateway + provider instance (server-side). */
export async function getConnectedProvider(
  businessId: string,
  name = PAYMENT_PROVIDERS.paystack,
): Promise<ResolvedProvider> {
  const row = await prisma.paymentProvider.findFirst({
    where: { businessId, provider: name },
  });
  if (!isGatewayConnected(row)) return { connected: false, provider: null };
  const secret = await getProviderSecret(businessId, name);
  return { connected: true, provider: buildProvider(name, secret) };
}