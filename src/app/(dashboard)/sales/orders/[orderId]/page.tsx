import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireDashboardAccess } from '@/lib/dashboard';
import { getOrderView } from '@/lib/order';
import { formatPrice } from '@/lib/format';
import { STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../../../_components/orders/status';
import OrderStatusActions from '../../../_components/orders/OrderStatusActions';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const access = await requireDashboardAccess();
  const { orderId } = await params;

  const order = await getOrderView(access.businessId, orderId);
  if (!order) notFound();

  return (
    <div>
      <Link
        href="/sales/orders"
        className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:underline"
      >
        ← Back to orders
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Order #{order.orderNumber}</h1>
        <span
          className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{
            background: order.status === 'payment_pending' ? '#fef3c7' : order.status === 'delivered' ? '#d1fae5' : '#e0e7ff',
            color: order.status === 'payment_pending' ? '#92400e' : order.status === 'delivered' ? '#065f46' : '#3730a3',
          }}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-muted)]">
        <span>Placed {order.createdAt.toLocaleString('en-NG')}</span>
        <span>
          {PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
          {order.paidAt && ` · paid ${order.paidAt.toLocaleString('en-NG')}`}
        </span>
      </div>

      <div className="mt-4">
        <OrderStatusActions orderId={order.id} status={order.status} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Customer</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--color-text-muted)]">Name</dt>
              <dd className="font-medium text-[var(--color-text)]">{order.customerName}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-text-muted)]">Email</dt>
              <dd>
                <a href={`mailto:${order.customerEmail}`} className="text-[var(--color-primary)] hover:underline">
                  {order.customerEmail}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-text-muted)]">Phone</dt>
              <dd className="text-[var(--color-text)]">
                {order.customerPhone ? (
                  <a href={`tel:${order.customerPhone}`} className="text-[var(--color-primary)] hover:underline">
                    {order.customerPhone}
                  </a>
                ) : (
                  <span className="text-[var(--color-text-muted)]">Not provided</span>
                )}
              </dd>
            </div>
            {order.notes && (
              <div>
                <dt className="text-[var(--color-text-muted)]">Order notes</dt>
                <dd className="whitespace-pre-line text-[var(--color-text)]">{order.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-white p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Delivery</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--color-text-muted)]">Method</dt>
              <dd className="font-medium text-[var(--color-text)]">
                {order.methodName}
                <span className="ml-1 text-[var(--color-text-muted)]">
                  ({order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)})
                </span>
              </dd>
            </div>
            {order.deliveryAddress ? (
              <div>
                <dt className="text-[var(--color-text-muted)]">Address</dt>
                <dd className="whitespace-pre-line text-[var(--color-text)]">
                  {order.deliveryAddress.address}
                  {order.deliveryAddress.landmark ? `\n${order.deliveryAddress.landmark}` : ''}
                  {'\n'}
                  {[order.deliveryAddress.city, order.deliveryAddress.state].filter(Boolean).join(', ')}
                </dd>
              </div>
            ) : (
              <div>
                <dt className="text-[var(--color-text-muted)]">Address</dt>
                <dd className="text-[var(--color-text-muted)]">To be arranged at pickup.</dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Items</h2>
        <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-[var(--color-text)]">
                {item.quantity} × {item.productName}
                {item.variantLabel && (
                  <span className="text-[var(--color-text-muted)]"> — {item.variantLabel}</span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-medium text-[var(--color-text)]">{formatPrice(item.total)}</span>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {formatPrice(item.unitPrice)} each
                </span>
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-[var(--color-border)] pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">Subtotal</dt>
            <dd className="text-[var(--color-text)]">{formatPrice(order.subtotal)}</dd>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--color-text-muted)]">Discount</dt>
              <dd className="text-green-700">−{formatPrice(order.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--color-text-muted)]">{order.methodName}</dt>
            <dd className="text-[var(--color-text)]">
              {order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-[var(--color-border)] pt-2">
            <dt className="font-semibold text-[var(--color-text)]">Total</dt>
            <dd className="font-bold text-[var(--color-text)]">{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Status history
        </h2>
        <ol className="mt-3 space-y-3">
          {order.history.map((entry, i) => (
            <li key={`${entry.changedAt.toISOString()}-${entry.status}-${i}`} className="flex gap-3 text-sm">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: i === order.history.length - 1 ? 'var(--color-primary)' : 'var(--color-border)',
                }}
              />
              <div>
                <p className="font-medium text-[var(--color-text)]">
                  {STATUS_LABELS[entry.status] ?? entry.status}
                </p>
                {entry.note && <p className="text-[var(--color-text-muted)]">{entry.note}</p>}
                <p className="text-xs text-[var(--color-text-muted)]">
                  {entry.changedAt.toLocaleString('en-NG')}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}