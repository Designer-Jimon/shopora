'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SerializedProduct } from '@/lib/catalog';
import { formatPrice, discountPercent } from '@/lib/format';

export default function ProductCard({
  product,
  basePath,
}: {
  product: SerializedProduct;
  basePath: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const pct = discountPercent(product.price, product.discountPrice);
  const out = product.effectiveStock === 0;
  const low = !out && product.effectiveStock <= 5;

  return (
    <Link
      href={`${basePath}/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border bg-[var(--sf-bg)]"
      style={{ borderColor: 'var(--sf-border)' }}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--sf-tint)]">
        {product.imageUrl && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--sf-tint)]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              {product.brand ?? 'Shopora'}
            </span>
          </div>
        )}
        {pct != null && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold text-white"
            style={{ background: 'var(--sf-primary)' }}
          >
            -{pct}%
          </span>
        )}
        {out && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-xs font-bold uppercase tracking-wide text-[var(--sf-muted)]">
            Sold out
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-1 text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
          {product.name}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold" style={{ color: 'var(--sf-primary)' }}>
            {formatPrice(product.discountPrice ?? product.price)}
          </span>
          {product.discountPrice != null && (
            <span className="text-xs text-[var(--sf-muted)] line-through line-clamp-1">
              {formatPrice(product.price)}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[11px] font-medium text-[var(--sf-muted)]">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: out ? '#b91c1c' : low ? '#b45309' : '#15803d',
              }}
            />
            {out ? 'Sold out' : low ? `Only ${product.effectiveStock} left` : 'In stock'}
          </span>
        </div>
      </div>
    </Link>
  );
}