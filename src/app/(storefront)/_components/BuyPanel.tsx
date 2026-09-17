'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SerializedProduct } from '@/lib/catalog';
import { formatPrice } from '@/lib/format';

export default function BuyPanel({
  product,
  slug,
}: {
  product: SerializedProduct;
  slug: string;
}) {
  const router = useRouter();
  const { variants } = product;

  const colors = useMemo(
    () => [...new Set(variants.map((v) => v.color).filter((c): c is string => !!c))],
    [variants],
  );
  const sizes = useMemo(
    () => [...new Set(variants.map((v) => v.size).filter((s): s is string => !!s))],
    [variants],
  );

  const [color, setColor] = useState<string | null>(colors[0] ?? null);
  const [size, setSize] = useState<string | null>(sizes[0] ?? null);
  const [qty, setQty] = useState(1);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedVariant = useMemo(() => {
    if (variants.length === 0) return null;
    return (
      variants.find(
        (v) => (!color || v.color === color) && (!size || v.size === size),
      ) ?? null
    );
  }, [variants, color, size]);

  const stock = selectedVariant ? selectedVariant.stockQuantity : product.effectiveStock;
  const out = stock === 0;
  const low = !out && stock <= 5;
  const price = selectedVariant?.priceOverride ?? product.price;
  const displayPrice = product.discountPrice != null ? Math.min(product.discountPrice, price) : price;
  const savings = price - displayPrice;

  async function addToCart(buyNow = false) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/store/${slug}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          variantId: selectedVariant?.id ?? null,
          quantity: qty,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setNotice({ kind: 'err', text: data?.error ?? 'Could not add to cart' });
        return;
      }
      router.refresh();
      if (buyNow) {
        router.push(`/${slug}/checkout`);
      } else {
        setNotice({ kind: 'ok', text: 'Added to cart' });
      }
    } catch {
      setNotice({ kind: 'err', text: 'Network error — please try again' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-[var(--sf-bg)] p-4 sm:p-5" style={{ borderColor: 'var(--sf-border)' }}>
      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-black" style={{ color: 'var(--sf-text)' }}>
          {formatPrice(displayPrice)}
        </span>
        {savings > 0 && (
          <span className="text-sm text-[var(--sf-muted)] line-through">
            {formatPrice(price)}
          </span>
        )}
      </div>

      {/* Stock */}
      <p className="mt-2 text-sm font-medium" style={{ color: out ? '#b91c1c' : low ? '#b45309' : '#15803d' }}>
        {out ? 'Sold out' : low ? `Only ${stock} left in stock` : 'In stock'}
      </p>

      {/* Variant selectors */}
      {colors.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
            Colour
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="rounded-full border px-3 py-1 text-sm font-medium"
                style={{
                  borderColor: color === c ? 'var(--sf-primary)' : 'var(--sf-border)',
                  background: color === c ? 'var(--sf-tint)' : 'var(--sf-bg)',
                  color: 'var(--sf-text)',
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {sizes.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
            Size
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSize(s)}
                className="rounded-full border px-3 py-1 text-sm font-medium"
                style={{
                  borderColor: size === s ? 'var(--sf-primary)' : 'var(--sf-border)',
                  background: size === s ? 'var(--sf-tint)' : 'var(--sf-bg)',
                  color: 'var(--sf-text)',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity */}
      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
          Quantity
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            aria-label="Decrease quantity"
            disabled={qty <= 1 || out}
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            className="h-9 w-9 rounded-md border text-lg font-bold"
            style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
          >
            −
          </button>
          <span className="w-10 text-center text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            disabled={qty >= Math.min(5, stock) || out}
            onClick={() => setQty((n) => Math.min(5, stock, n + 1))}
            className="h-9 w-9 rounded-md border text-lg font-bold"
            style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
          >
            +
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={out || busy}
          onClick={() => addToCart(false)}
          className="rounded-md border px-4 py-2.5 text-sm font-semibold transition hover:brightness-95 disabled:opacity-50"
          style={{
            borderColor: 'var(--sf-primary)',
            background: 'var(--sf-bg)',
            color: 'var(--sf-primary)',
          }}
        >
          {busy ? 'Adding…' : 'Add to cart'}
        </button>
        <button
          type="button"
          disabled={out || busy}
          onClick={() => addToCart(true)}
          className="rounded-md px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 disabled:opacity-50"
          style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
        >
          Buy now
        </button>
      </div>

      {notice && (
        <p
          className="mt-3 rounded-md px-3 py-2 text-sm"
          style={{
            background: 'var(--sf-tint)',
            color: notice.kind === 'ok' ? 'var(--sf-text)' : '#b91c1c',
          }}
        >
          {notice.kind === 'ok' ? (
            <>
              {notice.text}{' '}
              <Link href={`/${slug}/cart`} className="font-semibold underline">
                View cart
              </Link>
            </>
          ) : (
            notice.text
          )}
        </p>
      )}
    </div>
  );
}