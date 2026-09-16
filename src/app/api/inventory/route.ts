// SHOPORA — /api/inventory
//   GET  — current stock levels for all products (or a single product)
//   POST — manual stock adjustment (writes InventoryTransaction row)

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { adjustInventory } from '@/lib/catalog';
import prisma from '@/lib/prisma';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD ?? '5', 10);

export const GET = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const sp = new URL(request.url).searchParams;
  const productId = sp.get('productId');

  const where: Record<string, unknown> = { businessId: ctx.businessId };
  if (productId) where.id = productId;

  const products = await prisma.product.findMany({
    where,
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

  return jsonOk({
    threshold: LOW_STOCK_THRESHOLD,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    rows,
  });
});

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('products.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  if (!body.productId || typeof body.productId !== 'string') {
    return jsonError('productId is required', 422);
  }
  if (body.changeQty === undefined || body.changeQty === null) {
    return jsonError('changeQty is required', 422);
  }
  const changeQty = Number(body.changeQty);
  if (!Number.isInteger(changeQty) || changeQty === 0) {
    return jsonError('changeQty must be a non-zero integer', 422);
  }
  if (!body.reason || typeof body.reason !== 'string' || !body.reason.trim()) {
    return jsonError('reason is required', 422);
  }

  try {
    const tx = await adjustInventory({
      businessId: ctx.businessId,
      productId: body.productId as string,
      variantId: body.variantId as string | null | undefined,
      changeQty,
      reason: body.reason as string,
      createdById: ctx.userId,
    });
    return jsonOk(tx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Adjustment failed';
    return jsonError(msg, 422);
  }
});
