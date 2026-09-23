'use client';

// SHOPORA products table + toolbar — client component driven by URL search params.
// Displays product list with search, filter, sort, pagination.

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  price: number;
  discountPrice: number | null;
  status: string;
  imageUrl: string | null;
  effectiveStock: number;
  lowStock: boolean;
  category?: { name: string } | null;
};

type ProductsTableProps = {
  products: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-yellow-100 text-yellow-700',
    archived: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}

function stockIndicator(effectiveStock: number, lowStock: boolean) {
  if (effectiveStock === 0) return <span className="text-xs font-medium text-red-600">Out of stock</span>;
  if (lowStock) return <span className="text-xs font-medium text-amber-600">Low ({effectiveStock})</span>;
  return <span className="text-xs text-[var(--color-text-muted)]">{effectiveStock}</span>;
}

export default function ProductsTable({ products, total, page, totalPages }: ProductsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page'); // reset page on filter change
    router.push(`/products/all?${params.toString()}`);
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    updateParam('q', search);
  };

  const currentStatus = searchParams.get('status') ?? '';
  const currentSort = searchParams.get('sort') ?? 'newest';
  const currentStock = searchParams.get('stock') ?? '';

  return (
    <div>
      {/* Toolbar */}
      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label htmlFor="search" className="block text-xs font-medium text-[var(--color-text-muted)]">Search</label>
          <input id="search" type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, SKU, or brand…"
            className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none" />
        </div>
        <button type="submit" className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium hover:bg-gray-50">Search</button>

        <div>
          <label htmlFor="status-filter" className="block text-xs font-medium text-[var(--color-text-muted)]">Status</label>
          <select id="status-filter" value={currentStatus} onChange={(e) => updateParam('status', e.target.value)}
            className="mt-1 block rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div>
          <label htmlFor="stock-filter" className="block text-xs font-medium text-[var(--color-text-muted)]">Stock</label>
          <select id="stock-filter" value={currentStock} onChange={(e) => updateParam('stock', e.target.value)}
            className="mt-1 block rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm">
            <option value="">Any</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </div>

        <div>
          <label htmlFor="sort-filter" className="block text-xs font-medium text-[var(--color-text-muted)]">Sort</label>
          <select id="sort-filter" value={currentSort} onChange={(e) => updateParam('sort', e.target.value)}
            className="mt-1 block rounded-md border border-[var(--color-border)] bg-white px-2 py-2 text-sm">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name A–Z</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
            <option value="stock_asc">Stock ↑</option>
            <option value="stock_desc">Stock ↓</option>
          </select>
        </div>
      </form>

      <p className="mb-3 text-xs text-[var(--color-text-muted)]">{total} product{total !== 1 ? 's' : ''}</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Product</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Price</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Stock</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/products/${p.id}/edit`} className="flex items-center gap-3">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs text-gray-400">—</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--color-text)]">{p.name}</p>
                      {p.sku && <p className="truncate text-xs text-[var(--color-text-muted)]">{p.sku}</p>}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.discountPrice != null ? (
                    <>
                      <span className="text-[var(--color-primary)] font-semibold">₦{p.discountPrice.toLocaleString()}</span>
                      <span className="ml-1 text-xs text-[var(--color-text-muted)] line-through">₦{p.price.toLocaleString()}</span>
                    </>
                  ) : (
                    <span className="font-medium">₦{p.price.toLocaleString()}</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {stockIndicator(p.effectiveStock, p.lowStock)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{statusBadge(p.status)}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{p.category?.name ?? '—'}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">No products found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => updateParam('page', String(page - 1))}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-40">← Prev</button>
          <span className="text-sm text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => updateParam('page', String(page + 1))}
            className="rounded border border-[var(--color-border)] px-3 py-1 text-sm disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
