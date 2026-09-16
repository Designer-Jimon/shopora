import { requireDashboardAccess } from '@/lib/dashboard';
import InventoryPanel from '../../_components/products/InventoryPanel';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD ?? '5', 10);

export default async function InventoryPage() {
  const access = await requireDashboardAccess();

  // Query the DB directly (server component) — scoped by the verified session.
  const products = await prisma.product.findMany({
    where: { businessId: access.businessId },
    orderBy: { createdAt: 'desc' },
    include: {
      variants: { select: { id: true, sku: true, color: true, size: true, stockQuantity: true } },
    },
  });

  const rows = products.map((p) => {
    const variantStock = p.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
    const hasVariants = p.variants.length > 0;
    const effectiveStock = hasVariants ? variantStock : p.stockQuantity;
    return {
      productId: p.id,
      productName: p.name,
      productSku: p.sku,
      status: p.status,
      effectiveStock,
      baseStock: p.stockQuantity,
      lowStock: effectiveStock <= LOW_STOCK_THRESHOLD,
      hasVariants,
      variants: p.variants,
    };
  });

  const totalProducts = rows.length;
  const lowStockCount = rows.filter((r) => r.lowStock && r.effectiveStock > 0).length;
  const outOfStockCount = rows.filter((r) => r.effectiveStock === 0).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Inventory</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">View stock levels and make manual adjustments.</p>
      </div>
      <InventoryPanel
        rows={rows}
        threshold={LOW_STOCK_THRESHOLD}
        totalProducts={totalProducts}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
      />
    </div>
  );
}
