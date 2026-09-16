import Link from 'next/link';
import { requireDashboardAccess } from '@/lib/dashboard';
import { listProducts } from '@/lib/catalog';
import ProductsTable from '../../_components/products/ProductsTable';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD ?? '5', 10);

export const dynamic = 'force-dynamic';

export default async function AllProductsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const access = await requireDashboardAccess();

  const sp = searchParams;
  const q = typeof sp.q === 'string' ? sp.q : undefined;
  const categoryId = typeof sp.category === 'string' ? sp.category : undefined;
  const status = typeof sp.status === 'string' ? sp.status : undefined;
  const stock = typeof sp.stock === 'string' ? (sp.stock as 'low' | 'out') : undefined;
  const sort = typeof sp.sort === 'string' ? sp.sort : undefined;
  const page = typeof sp.page === 'string' ? parseInt(sp.page, 10) || 1 : 1;

  const result = await listProducts({
    businessId: access.businessId,
    q,
    categoryId,
    status,
    stock,
    sort,
    page,
    pageSize: 25,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  });

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">All Products</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Browse and manage your product catalogue.</p>
        </div>
        <Link href="/products/add"
          className="mt-3 inline-flex rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 sm:mt-0">
          + Add product
        </Link>
      </div>

      <div className="mt-6">
        <ProductsTable
          products={result.products}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          totalPages={result.totalPages}
        />
      </div>
    </div>
  );
}
