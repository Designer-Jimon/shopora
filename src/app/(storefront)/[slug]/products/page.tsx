import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStorefrontBusiness, listStorefrontCategories, listStorefrontProducts } from '@/lib/storefront';
import ProductCard from '../../_components/ProductCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) return { title: 'Store not found' };
  return {
    title: `Products — ${biz.name}`,
    description: `Browse products from ${biz.name}.`,
  };
}

const SORTS: { value: string; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

function positiveNumber(v: unknown): number | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function pageLink(base: string, values: Record<string, string>): string {
  const params = new URLSearchParams(values);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function StoreProducts({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: {
    q?: string;
    category?: string;
    minPrice?: string;
    maxPrice?: string;
    sort?: string;
    page?: string;
  };
}) {
  const biz = await getStorefrontBusiness(params.slug);
  if (!biz) notFound();

  const q = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';
  const category = typeof searchParams.category === 'string' ? searchParams.category : '';
  const minPrice = positiveNumber(searchParams.minPrice);
  const maxPrice = positiveNumber(searchParams.maxPrice);
  const sort = SORTS.some((s) => s.value === searchParams.sort) ? String(searchParams.sort) : 'newest';
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const [cats, result] = await Promise.all([
    listStorefrontCategories(biz.id),
    listStorefrontProducts({ businessId: biz.id, q, categoryId: category, minPrice, maxPrice, sort, page, pageSize: 12 }),
  ]);

  const base = `/${biz.slug}/products`;

  const filterValues: Record<string, string> = {};
  if (q) filterValues.q = q;
  if (category) filterValues.category = category;
  if (minPrice != null) filterValues.minPrice = String(minPrice);
  if (maxPrice != null) filterValues.maxPrice = String(maxPrice);
  if (sort !== 'newest') filterValues.sort = sort;

  const fieldCls =
    'h-10 rounded-md border px-3 text-sm w-full bg-[var(--sf-bg)]' +
    ' focus:outline-none focus:ring-2 focus:ring-[var(--sf-primary)]/30';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-[var(--sf-muted)]">
        <Link href={`/${biz.slug}`} className="hover:text-[var(--sf-primary)]">
          {biz.name}
        </Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium" style={{ color: 'var(--sf-text)' }}>
          Products
        </span>
      </nav>

      <h1 className="mt-2 text-xl font-black sm:text-2xl" style={{ color: 'var(--sf-text)' }}>
        Products
      </h1>

      {/* Filters (native GET form — works without JS) */}
      <form method="get" action={base} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search products"
          className={fieldCls}
          style={{ borderColor: 'var(--sf-border)' }}
        />
        <select
          name="category"
          defaultValue={category}
          className={fieldCls}
          style={{ borderColor: 'var(--sf-border)' }}
        >
          <option value="">All categories</option>
          {cats.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <input
          name="minPrice"
          type="number"
          min="0"
          step="any"
          inputMode="numeric"
          defaultValue={minPrice ?? ''}
          placeholder="Min price"
          className={fieldCls}
          style={{ borderColor: 'var(--sf-border)' }}
        />
        <input
          name="maxPrice"
          type="number"
          min="0"
          step="any"
          inputMode="numeric"
          defaultValue={maxPrice ?? ''}
          placeholder="Max price"
          className={fieldCls}
          style={{ borderColor: 'var(--sf-border)' }}
        />
        <select name="sort" defaultValue={sort} className={fieldCls} style={{ borderColor: 'var(--sf-border)' }}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-10 rounded-md px-4 text-sm font-semibold transition hover:brightness-110"
          style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
        >
          Filter
        </button>
      </form>

      <p className="mt-4 text-sm text-[var(--sf-muted)]">
        {result.total === 0 ? 'No products match your filters.' : `Showing ${result.products.length} of ${result.total} products.`}
      </p>

      {result.products.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {result.products.map((product) => (
            <ProductCard key={product.id} product={product} basePath={base} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {result.totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {result.page > 1 && (
            <Link
              href={pageLink(base, { ...filterValues, page: String(result.page - 1) })}
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
            >
              Prev
            </Link>
          )}
          {Array.from({ length: result.totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageLink(base, { ...filterValues, page: String(p) })}
              aria-current={p === result.page ? 'page' : undefined}
              className="rounded-md px-3 py-1.5 text-sm font-medium"
              style={
                p === result.page
                  ? { background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }
                  : { borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }
              }
            >
              {p}
            </Link>
          ))}
          {result.page < result.totalPages && (
            <Link
              href={pageLink(base, { ...filterValues, page: String(result.page + 1) })}
              className="rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}