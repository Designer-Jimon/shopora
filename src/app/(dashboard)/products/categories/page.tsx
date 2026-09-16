import { requireDashboardAccess } from '@/lib/dashboard';
import { getCategoryTree } from '@/lib/catalog';
import CategoryManager from '../../_components/products/CategoryManager';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const access = await requireDashboardAccess();
  const categories = await getCategoryTree(access.businessId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Categories</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Organise your products into categories and subcategories.</p>
      </div>
      <CategoryManager categories={categories} />
    </div>
  );
}
