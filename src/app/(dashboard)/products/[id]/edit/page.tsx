import { notFound } from 'next/navigation';
import { requireDashboardAccess } from '@/lib/dashboard';
import { getProduct } from '@/lib/catalog';
import prisma from '@/lib/prisma';
import ProductForm from '../../../_components/products/ProductForm';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireDashboardAccess();
  const { id } = await params;

  const product = await getProduct(access.businessId, id);
  if (!product) notFound();

  const categories = await prisma.category.findMany({
    where: { businessId: access.businessId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, slug: true },
  });

  const initialData = {
    id: product.id,
    name: product.name,
    description: product.description,
    brand: product.brand,
    sku: product.sku,
    price: Number(product.price),
    discountPrice: product.discountPrice != null ? Number(product.discountPrice) : null,
    status: product.status,
    stockQuantity: product.stockQuantity,
    categoryId: product.categoryId,
    seoTitle: product.seoTitle,
    seoDescription: product.seoDescription,
    images: product.images,
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      size: v.size,
      weight: v.weight != null ? Number(v.weight) : null,
      priceOverride: v.priceOverride != null ? Number(v.priceOverride) : null,
      stockQuantity: v.stockQuantity,
    })),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Edit Product</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{product.name}</p>
      </div>
      <ProductForm categories={categories} initialData={initialData} isEdit />
    </div>
  );
}
