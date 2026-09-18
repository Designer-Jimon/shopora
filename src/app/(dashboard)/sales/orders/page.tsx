import Link from 'next/link';
import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import { formatPrice } from '@/lib/format';
import OrderStatusActions from '../../_components/orders/OrderStatusActions';
import { STATUS_LABELS } from '../../_components/orders/status';

export default async function OrdersPage() {
  const access = await requireDashboardAccess();

  const orders = await prisma.order.findMany({
    where: { businessId: access.businessId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { _count: { select: { items: true } } },
  });

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Orders</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            {orders.length === 0
              ? 'No orders yet — orders from your storefront will appear here.'
              : `${orders.length} most recent order(s).`}
          </p>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="mt-6 rounded-lg border border-[var(--color-border)] bg-white p-6">
          <p className="text-sm text-[var(--color-text-muted)]">
            Customer orders will show up here once your checkout is live and customers place orders.
          </p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Date</th>
                <th className="px-4 py-3 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-[var(--color-muted)]/5">
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text)]">
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="font-medium hover:text-[var(--color-primary)] hover:underline"
                    >
                      #{order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    <Link
                      href={`/sales/orders/${order.id}`}
                      className="font-medium hover:text-[var(--color-primary)] hover:underline"
                    >
                      {order.customerName}
                    </Link>
                    <span className="ml-1 text-[var(--color-text-muted)]">{order._count.items} item(s)</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{
                        background: order.status === 'payment_pending' ? '#fef3c7' : order.status === 'delivered' ? '#d1fae5' : '#e0e7ff',
                        color: order.status === 'payment_pending' ? '#92400e' : order.status === 'delivered' ? '#065f46' : '#3730a3',
                      }}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-[var(--color-text)]">
                    {formatPrice(Number(order.total))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--color-text-muted)]">
                    {order.createdAt.toLocaleDateString('en-NG')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <OrderStatusActions orderId={order.id} status={order.status} />
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