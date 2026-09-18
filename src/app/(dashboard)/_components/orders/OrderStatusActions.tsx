'use client';

// SHOPORA — per-order status control in the Orders table (Phase 8).
// A compact select + action button. Moving an unpaid order forward records the
// manual payment (bank transfer / COD), idempotently, via PATCH
// /api/orders/[orderId]/status.

import { useState, useTransition } from 'react';

const AWAITING_PAYMENT = 'payment_pending';

const STATUS_OPTIONS = [
  { value: 'payment_pending', label: 'Awaiting payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

type Props = {
  orderId: string;
  status: string;
};

export default function OrderStatusActions({ orderId, status }: Props) {
  const [pendingStatus, setPendingStatus] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const isUnpaid = status === AWAITING_PAYMENT;
  const next = pendingStatus ?? (isUnpaid ? 'paid' : '');

  async function apply(nextStatus: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, note: undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not update order status.');
        setBusy(false);
        return;
      }
      setPendingStatus(nextStatus);
      startTransition(() => window.location.reload());
    } catch {
      setError('Network error — please try again.');
      setBusy(false);
    }
  }

  if (status === AWAITING_PAYMENT || status === 'paid') {
    return (
      <div className="flex items-center gap-2">
        <select
          value={isUnpaid ? 'paid' : next || status}
          onChange={(e) => apply(e.target.value)}
          disabled={busy}
          className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs text-[var(--color-text)] outline-none"
        >
          {STATUS_OPTIONS.filter((o) => o.value === status || (isUnpaid && o.value === 'paid')).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {STATUS_OPTIONS.filter(
            (o) => o.value !== status && o.value !== 'payment_pending' && !(isUnpaid && o.value === 'paid'),
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isUnpaid && <span className="text-xs text-[var(--color-text-muted)]">marks as paid</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
}