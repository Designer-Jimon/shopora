'use client';

// SHOPORA inventory panel — current stock view + manual adjustment via POST /api/inventory.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Variant = { id: string; sku: string | null; color: string | null; size: string | null; stockQuantity: number };

type InventoryRow = {
  productId: string;
  productName: string;
  productSku: string | null;
  status: string;
  effectiveStock: number;
  baseStock: number;
  lowStock: boolean;
  hasVariants: boolean;
  variants: Variant[];
};

type InventoryPanelProps = {
  rows: InventoryRow[];
  threshold: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export default function InventoryPanel({ rows, threshold, totalProducts, lowStockCount, outOfStockCount }: InventoryPanelProps) {
  const router = useRouter();
  const [adjusting, setAdjusting] = useState<{ productId: string; variantId?: string } | null>(null);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startAdjust = (productId: string, variantId?: string) => {
    setAdjusting({ productId, variantId }); setQty(''); setReason(''); setError(null);
  };

  const handleAdjust = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: adjusting?.productId, variantId: adjusting?.variantId, changeQty: parseInt(qty, 10), reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Adjustment failed');
        return;
      }
      setAdjusting(null);
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">Total products</p>
          <p className="mt-1 text-2xl font-bold text-[var(--color-primary)]">{totalProducts}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium uppercase text-amber-700">Low stock (≤ {threshold})</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{lowStockCount}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium uppercase text-red-600">Out of stock</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{outOfStockCount}</p>
        </div>
      </div>

      {/* Adjustment modal */}
      {adjusting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Adjust stock</h3>
            <form onSubmit={handleAdjust} className="mt-4 space-y-3">
              {error && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
              <div>
                <label htmlFor="adj-qty" className="block text-xs font-medium text-[var(--color-text)]">Quantity change (use negative to reduce) *</label>
                <input id="adj-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} required
                  className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. 50 or -10" />
              </div>
              <div>
                <label htmlFor="adj-reason" className="block text-xs font-medium text-[var(--color-text)]">Reason *</label>
                <input id="adj-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} required
                  className="mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="e.g. Restock, Damaged, Correction" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdjusting(null)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Adjusting…' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-[var(--color-border)] bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Product</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">SKU</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Stock</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Status</th>
              <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((r) => (
              <>
                <tr key={r.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-[var(--color-text)]">{r.productName}</td>
                  <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">{r.productSku ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.effectiveStock === 0 ? (
                      <span className="font-medium text-red-600">0</span>
                    ) : r.lowStock ? (
                      <span className="font-medium text-amber-600">{r.effectiveStock} ⚠</span>
                    ) : (
                      <span>{r.effectiveStock}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${r.status === 'active' ? 'bg-green-100 text-green-700' : r.status === 'draft' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => startAdjust(r.productId)} className="text-xs font-medium text-[var(--color-primary)] hover:underline">Adjust</button>
                  </td>
                </tr>
                {r.variants.map((v) => (
                  <tr key={v.id} className="bg-gray-50/50 hover:bg-gray-100">
                    <td className="px-4 py-2 pl-10 text-xs text-[var(--color-text-muted)]">
                      {v.color ?? ''} {v.size ?? ''} {v.sku ? `(${v.sku})` : ''}
                    </td>
                    <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{v.sku ?? '—'}</td>
                    <td className="px-4 py-2 text-xs">
                      {v.stockQuantity === 0 ? (
                        <span className="font-medium text-red-600">0</span>
                      ) : v.stockQuantity <= threshold ? (
                        <span className="font-medium text-amber-600">{v.stockQuantity} ⚠</span>
                      ) : (
                        <span>{v.stockQuantity}</span>
                      )}
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">
                      <button onClick={() => startAdjust(r.productId, v.id)} className="text-xs text-[var(--color-primary)] hover:underline">Adjust</button>
                    </td>
                  </tr>
                ))}
              </>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">No products to track.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
