import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import ProvidersPanel, { type ProviderSummary } from '../../_components/payments/ProvidersPanel';

export const dynamic = 'force-dynamic';

export default async function PaymentProvidersPage() {
  const access = await requireDashboardAccess();
  if (!access.permissions.includes('payments.manage') && access.businessRole !== 'Owner') {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Payment Providers</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">
          You don&apos;t have permission to manage payment gateways on this business.
        </p>
      </div>
    );
  }

  const rows = await prisma.paymentProvider.findMany({
    where: { businessId: access.businessId, provider: { in: ['paystack'] } },
    orderBy: { createdAt: 'asc' },
  });

  const providers: ProviderSummary[] = rows.map((r) => ({
    provider: r.provider,
    status: r.status as 'connected' | 'disconnected',
    publicKey: r.publicKey,
    connectedAt: r.connectedAt ? r.connectedAt.toISOString() : null,
  }));

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Payment Providers</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Connect a payment gateway so customers can pay online at checkout.
            Everything else falls back to bank transfer / cash on delivery.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <ProvidersPanel initialProviders={providers} />
      </div>
    </div>
  );
}