import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TX_STATUS_LABELS: Record<string, string> = {
  initiated: 'Initiated',
  pending: 'Pending',
  success: 'Success',
  failed: 'Failed',
};

export default async function PaymentsTransactionsPage() {
  const access = await requireDashboardAccess();

  const transactions = await prisma.transaction.findMany({
    where: { businessId: access.businessId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { orderNumber: true } } },
  });

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Transactions</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Payments initiated through connected gateways and manual confirmations, newest first.
          </p>
        </div>
      </div>

      {transactions.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
          <p className="text-sm font-medium text-[var(--color-text)]">No transactions yet</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Once customers check out — online or via transfer — the payment records will appear here.
          </p>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-[var(--color-muted)]/5">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--color-text)]">
                    {tx.providerRef ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {tx.order ? `#${tx.order.orderNumber}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">{tx.provider}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background:
                          tx.status === 'success' ? '#d1fae5' : tx.status === 'failed' ? '#fee2e2' : '#fef3c7',
                        color: tx.status === 'success' ? '#065f46' : tx.status === 'failed' ? '#991b1b' : '#92400e',
                      }}
                    >
                      {TX_STATUS_LABELS[tx.status] ?? tx.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--color-text)]">
                    {tx.amount ? formatPrice(Number(tx.amount)) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--color-text-muted)]">
                    {tx.createdAt.toLocaleString('en-NG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}