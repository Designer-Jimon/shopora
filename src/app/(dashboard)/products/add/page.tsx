import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import ProductForm from '../../_components/products/ProductForm';

export const dynamic = 'force-dynamic';

export default async function AddProductPage() {
  const access = await requireDashboardAccess();

  const categories = await prisma.category.findMany({
    where: { businessId: access.businessId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Add Product</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Create a new product in your catalogue.</p>
      </div>
      <ProductForm categories={categories} />
    </div>
  );
}
