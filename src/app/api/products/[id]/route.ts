// SHOPORA — /api/products/[id]
//   GET   — fetch single product with variants + images
//   PATCH — update product (owner or products.write)
//   DELETE — delete product (owner or products.delete)

import { NextRequest } from 'next/server';
import { jsonOk, jsonNoContent, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { getProduct, serializeProduct } from '@/lib/catalog';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/validate';

type Ctx = { params: Promise<{ id: string }> };

export const GET = requireAuthHandler(async (_request: NextRequest, context: unknown) => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const product = await getProduct(ctx.businessId, id);
  if (!product) return authErrors.notFound('Product not found');

  return jsonOk(serializeProduct(product));
});

export const PATCH = requireAuthHandler(async (request: NextRequest, context: unknown) => {
  requirePermission('products.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const existing = await getProduct(ctx.businessId, id);
  if (!existing) return authErrors.notFound('Product not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const errors: { field: string; message: string }[] = [];
  const data: Record<string, unknown> = {};

  if ('name' in body) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      errors.push({ field: 'name', message: 'Product name is required' });
    } else {
      data.name = (body.name as string).trim();
      // Regenerate slug when name changes
      if (data.name !== existing.name) {
        let slug = slugify(data.name as string) || 'product';
        let counter = 2;
        while (
          await prisma.product.findFirst({
            where: { businessId: ctx.businessId, slug, id: { not: id } },
          })
        ) {
          slug = `${slugify(data.name as string)}-${counter}`;
          counter++;
        }
        data.slug = slug;
      }
    }
  }

  if ('price' in body) {
    if (body.price === null || body.price === undefined || isNaN(Number(body.price)) || Number(body.price) < 0) {
      errors.push({ field: 'price', message: 'A valid non-negative price is required' });
    } else {
      data.price = Number(body.price);
    }
  }
  if ('discountPrice' in body) {
    data.discountPrice = body.discountPrice != null ? Number(body.discountPrice) : null;
  }
  if ('status' in body) {
    const allowed = ['draft', 'active', 'archived'];
    if (!allowed.includes(body.status as string)) {
      errors.push({ field: 'status', message: `Status must be one of: ${allowed.join(', ')}` });
    } else {
      data.status = body.status;
    }
  }

  const optionalText = ['description', 'brand', 'sku', 'seoTitle', 'seoDescription', 'categoryId'] as const;
  for (const field of optionalText) {
    if (field in body) {
      data[field] = typeof body[field] === 'string' ? (body[field] as string).trim() || null : body[field] ?? null;
    }
  }
  if ('stockQuantity' in body) {
    data.stockQuantity = Number(body.stockQuantity ?? 0);
  }

  if (errors.length > 0) return jsonError('Validation failed', 422);

  // Tenant isolation: when switching categories, the new one must belong to
  // this business (body-owned categoryId must not escape tenant scope).
  if ('categoryId' in body) {
    const categoryId = data.categoryId as string | null;
    if (categoryId) {
      const owned = await prisma.category.findFirst({
        where: { id: categoryId, businessId: ctx.businessId },
        select: { id: true },
      });
      if (!owned) return authErrors.badRequest('Category does not belong to this business');
    }
  }

  // Sync image rows when the client sends an updated image list
  if (Array.isArray(body.imageUrls)) {
    const urls = (body.imageUrls as string[]).filter(Boolean);
    await prisma.productImage.deleteMany({ where: { productId: id } });
    if (urls.length > 0) {
      await prisma.productImage.createMany({
        data: urls.map((url: string, i: number) => ({ productId: id, url, position: i })),
      });
    }
  }

  // Sync variants: update those with an id, create new ones, delete removed
  // ones (only when no inventory history references them).
  if (Array.isArray(body.variants)) {
    const incoming = body.variants as Record<string, unknown>[];
    const incomingIds = incoming.filter((v) => typeof v.id === 'string').map((v) => v.id as string);

    const existingAll = await prisma.productVariant.findMany({ where: { productId: id } });
    for (const v of existingAll) {
      if (!incomingIds.includes(v.id)) {
        const hasHistory = await prisma.inventoryTransaction.count({ where: { variantId: v.id } });
        if (hasHistory === 0) {
          await prisma.productVariant.delete({ where: { id: v.id } });
        }
      }
    }

    for (const v of incoming) {
      const data = {
        sku: typeof v.sku === 'string' ? v.sku.trim() || null : null,
        color: typeof v.color === 'string' ? v.color.trim() || null : null,
        size: typeof v.size === 'string' ? v.size.trim() || null : null,
        weight: v.weight != null && String(v.weight) !== '' ? Number(v.weight) : null,
        priceOverride: v.priceOverride != null && String(v.priceOverride) !== '' ? Number(v.priceOverride) : null,
        stockQuantity: Number(v.stockQuantity ?? 0),
      };
      if (typeof v.id === 'string') {
        await prisma.productVariant.update({ where: { id: v.id }, data });
      } else {
        await prisma.productVariant.create({ data: { productId: id, ...data } });
      }
    }
  }

  const updated = await prisma.product.update({
    where: { id },
    data: data as never,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { select: { id: true, url: true, position: true } },
      variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
    },
  });

  return jsonOk(serializeProduct(updated));
});

export const DELETE = requireAuthHandler(async (_request: NextRequest, context: unknown) => {
  requirePermission('products.delete');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const product = await getProduct(ctx.businessId, id);
  if (!product) return authErrors.notFound('Product not found');

  await prisma.product.delete({ where: { id } });
  return jsonNoContent();
});
