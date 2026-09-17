import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontBusiness } from '@/lib/storefront';
import { getOrderView } from '@/lib/order';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  payment_pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: { slug: string; orderId: string };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const order = await getOrderView(biz.id, params.orderId);
  if (!order) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="rounded-lg border p-6 sm:p-8" style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}>
        <div className="text-center">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-xl"
            style={{ background: 'var(--sf-tint)', color: 'var(--sf-primary)' }}
          >
            ✓
          </span>
          <h1 className="mt-3 text-xl font-black sm:text-2xl" style={{ color: 'var(--sf-text)' }}>
            Order placed
          </h1>
          <p className="mt-1 text-sm text-[var(--sf-muted)]">
            Thank you, {order.customerName.split(' ')[0]}. Your order has been received.
          </p>
          <p className="mt-2 inline-block rounded-md px-3 py-1 text-sm font-semibold" style={{ background: 'var(--sf-tint)', color: 'var(--sf-text)' }}>
            Order #{order.orderNumber}
          </p>
        </div>

        <div className="mt-6 rounded-md p-4" style={{ background: 'var(--sf-tint)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Status</p>
          <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
            {STATUS_LABELS[order.status] ?? order.status}
          </p>
          <p className="mt-1 text-xs text-[var(--sf-muted)]">
            {order.status === 'payment_pending'
              ? 'Payment is not yet processed — you will settle when your order is ready (pickup) or delivered.'
              : 'Payment received.'}
          </p>
        </div>

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Items</p>
          <ul className="mt-2 divide-y" style={{ borderColor: 'var(--sf-border)' }}>
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm" style={{ borderTop: '1px solid var(--sf-border)' }}>
                <span style={{ color: 'var(--sf-text)' }}>
                  {item.quantity} × {item.productName}
                  {item.variantLabel && <span className="text-[var(--sf-muted)]"> — {item.variantLabel}</span>}
                </span>
                <span className="shrink-0 font-medium" style={{ color: 'var(--sf-text)' }}>
                  {formatPrice(item.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--sf-muted)]">Subtotal</dt>
            <dd style={{ color: 'var(--sf-text)' }}>{formatPrice(order.subtotal)}</dd>
          </div>
          {order.discountTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--sf-muted)]">You save</dt>
              <dd style={{ color: '#15803d' }}>−{formatPrice(order.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--sf-muted)]">{order.methodName}</dt>
            <dd style={{ color: 'var(--sf-text)' }}>
              {order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)}
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--sf-border)' }}>
            <dt className="font-semibold" style={{ color: 'var(--sf-text)' }}>Total</dt>
            <dd className="font-black" style={{ color: 'var(--sf-text)' }}>{formatPrice(order.total)}</dd>
          </div>
        </dl>

        <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Contact</p>
            <p className="mt-1" style={{ color: 'var(--sf-text)' }}>{order.customerName}</p>
            <p className="text-[var(--sf-muted)]">{order.customerEmail}</p>
            {order.customerPhone && <p className="text-[var(--sf-muted)]">{order.customerPhone}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Delivery</p>
            <p className="mt-1" style={{ color: 'var(--sf-text)' }}>{order.methodName}</p>
            {order.deliveryAddress ? (
              <p className="text-[var(--sf-muted)]">
                {[
                  order.deliveryAddress.address,
                  order.deliveryAddress.city,
                  order.deliveryAddress.state,
                  order.deliveryAddress.landmark,
                ].filter(Boolean).join(', ')}
              </p>
            ) : (
              <p className="text-[var(--sf-muted)]">To be arranged at pickup.</p>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/${biz.slug}`}
            className="rounded-md px-5 py-2.5 text-sm font-semibold"
            style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
          >
            Back to store
          </Link>
          <Link
            href={`/${biz.slug}/products`}
            className="rounded-md border px-5 py-2.5 text-sm font-semibold"
            style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
          >
            Keep shopping
          </Link>
        </div>
      </div>
    </div>
  );
}