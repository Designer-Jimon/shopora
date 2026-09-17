'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CartView } from '@/lib/cart';
import { formatPrice } from '@/lib/format';

type Props = {
  slug: string;
  initialCart: CartView;
};

export default function CartPanel({ slug, initialCart }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView>(initialCart);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/store/${slug}/cart`);
    if (res.ok) {
      const data = await res.json();
      setCart(data);
      setError(null);
    }
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function changeQty(itemId: string, quantity: number) {
    setBusyItem(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/store/${slug}/cart`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not update quantity');
        await refresh();
        return;
      }
      const data = await res.json();
      setCart(data.cart);
    } finally {
      setBusyItem(null);
    }
  }

  async function removeItem(itemId: string) {
    setBusyItem(itemId);
    setError(null);
    try {
      const res = await fetch(`/api/store/${slug}/cart/${itemId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Could not remove item');
        return;
      }
      setCart(data.cart);
      router.refresh();
    } finally {
      setBusyItem(null);
    }
  }

  if (cart.empty) {
    return (
      <div
        className="rounded-lg border p-10 text-center"
        style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
          Your cart is empty
        </p>
        <p className="mt-2 text-sm text-[var(--sf-muted)]">
          Browse the store and add something you love.
        </p>
        <Link
          href={`/${slug}/products`}
          className="mt-5 inline-block rounded-md px-4 py-2.5 text-sm font-semibold"
          style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {cart.items.map((line) => (
          <div
            key={line.id}
            className="flex gap-4 rounded-lg border p-4"
            style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}
          >
            <Link href={`/${slug}/products/${line.productSlug}`} className="shrink-0">
              {line.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={line.imageUrl}
                  alt={line.name}
                  className="h-20 w-20 rounded-md object-cover"
                />
              ) : (
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-md text-lg font-bold"
                  style={{ background: 'var(--sf-tint)', color: 'var(--sf-primary)' }}
                >
                  {(line.name || 'S').charAt(0).toUpperCase()}
                </span>
              )}
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/${slug}/products/${line.productSlug}`}
                  className="line-clamp-2 text-sm font-semibold hover:underline"
                  style={{ color: 'var(--sf-text)' }}
                >
                  {line.name}
                </Link>
                <p className="shrink-0 text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                  {formatPrice(line.lineTotal)}
                </p>
              </div>

              {line.variantLabel && (
                <p className="mt-0.5 text-xs text-[var(--sf-muted)]">{line.variantLabel}</p>
              )}

              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    disabled={line.quantity <= 1 || busyItem === line.id}
                    onClick={() => changeQty(line.id, line.quantity - 1)}
                    className="h-8 w-8 rounded-md border text-base font-bold disabled:opacity-40"
                    style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    disabled={line.quantity >= line.stock || busyItem === line.id}
                    onClick={() => changeQty(line.id, line.quantity + 1)}
                    className="h-8 w-8 rounded-md border text-base font-bold disabled:opacity-40"
                    style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busyItem === line.id}
                  onClick={() => removeItem(line.id)}
                  className="text-xs font-medium text-[var(--sf-muted)] underline hover:text-[#b91c1c] disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside
        className="h-fit rounded-lg border p-5"
        style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}
      >
        <p className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>Order summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--sf-muted)]">Subtotal ({cart.itemCount} items)</dt>
            <dd className="font-medium" style={{ color: 'var(--sf-text)' }}>{formatPrice(cart.subtotal)}</dd>
          </div>
          {cart.discountTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--sf-muted)]">You save</dt>
              <dd className="font-medium" style={{ color: '#15803d' }}>
                −{formatPrice(cart.discountTotal)}
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--sf-border)' }}>
            <dt className="text-[var(--sf-muted)]">Delivery</dt>
            <dd className="font-medium" style={{ color: 'var(--sf-text)' }}>Calculated at checkout</dd>
          </div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--sf-border)' }}>
            <dt className="font-semibold" style={{ color: 'var(--sf-text)' }}>Total</dt>
            <dd className="font-black" style={{ color: 'var(--sf-text)' }}>{formatPrice(cart.subtotal)}</dd>
          </div>
        </dl>

        {error && (
          <p className="mt-3 rounded-md px-3 py-2 text-xs" style={{ background: 'var(--sf-tint)', color: '#b91c1c' }}>
            {error}
          </p>
        )}

        <Link
          href={`/${slug}/checkout`}
          className="mt-4 block rounded-md px-4 py-3 text-center text-sm font-bold"
          style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
        >
          Checkout securely
        </Link>
        <Link
          href={`/${slug}/products`}
          className="mt-2 block text-center text-xs text-[var(--sf-muted)] hover:text-[var(--sf-primary)]"
        >
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}