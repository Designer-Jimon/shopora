// SHOPORA — /api/products
//   GET  — list products (search, filter, sort, pagination)
//   POST — create a new product (with images + variants)

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { listProducts, canCreateProduct, serializeProduct, type ProductListParams } from '@/lib/catalog';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/validate';

const LOW_STOCK_THRESHOLD = parseInt(process.env.LOW_STOCK_THRESHOLD ?? '5', 10);

export const GET = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const sp = new URL(request.url).searchParams;

  const params: ProductListParams = {
    businessId: ctx.businessId,
    q: sp.get('q') ?? undefined,
    categoryId: sp.get('category') ?? undefined,
    status: sp.get('status') ?? undefined,
    stock: (sp.get('stock') as 'low' | 'out') ?? undefined,
    sort: sp.get('sort') ?? 'newest',
    page: parseInt(sp.get('page') ?? '1', 10) || 1,
    pageSize: Math.min(parseInt(sp.get('pageSize') ?? '25', 10) || 25, 100),
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };

  const result = await listProducts(params);
  return jsonOk(result);
});

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('products.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const limit = await canCreateProduct(ctx.businessId);
  if (!limit.allowed) {
    return jsonError(`Product limit reached (${limit.limit}). Upgrade your subscription.`, 403);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const errors: { field: string; message: string }[] = [];

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    errors.push({ field: 'name', message: 'Product name is required' });
  }
  if (body.price === undefined || body.price === null || isNaN(Number(body.price)) || Number(body.price) < 0) {
    errors.push({ field: 'price', message: 'A valid non-negative price is required' });
  }
  if (body.discountPrice !== undefined && body.discountPrice !== null && (isNaN(Number(body.discountPrice)) || Number(body.discountPrice) < 0)) {
    errors.push({ field: 'discountPrice', message: 'Discount price must be a non-negative number' });
  }
  const allowedStatuses = ['draft', 'active', 'archived'];
  if (body.status && !allowedStatuses.includes(body.status as string)) {
    errors.push({ field: 'status', message: `Status must be one of: ${allowedStatuses.join(', ')}` });
  }

  if (errors.length > 0) {
    return jsonError('Validation failed', 422);
  }

  // Tenant isolation: a category can only be used if it belongs to this business.
  const categoryId = (body.categoryId as string) || null;
  if (categoryId) {
    const owned = await prisma.category.findFirst({
      where: { id: categoryId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!owned) return authErrors.badRequest('Category does not belong to this business');
  }

  // Generate slug, ensure uniqueness per business
  let slug = slugify(body.name as string) || 'product';
  let counter = 2;
  while (await prisma.product.findFirst({ where: { businessId: ctx.businessId, slug } })) {
    slug = `${slugify(body.name as string)}-${counter}`;
    counter++;
  }

  const product = await prisma.product.create({
    data: {
      businessId: ctx.businessId,
      categoryId,
      name: (body.name as string).trim(),
      slug,
      description: (body.description as string)?.trim() || null,
      brand: (body.brand as string)?.trim() || null,
      sku: (body.sku as string)?.trim() || null,
      price: Number(body.price),
      discountPrice: body.discountPrice != null ? Number(body.discountPrice) : null,
      status: (body.status as string) || 'draft',
      stockQuantity: Number(body.stockQuantity ?? 0),
      seoTitle: (body.seoTitle as string)?.trim() || null,
      seoDescription: (body.seoDescription as string)?.trim() || null,
      images: {
        create: Array.isArray(body.imageUrls)
          ? (body.imageUrls as string[]).filter(Boolean).map((url: string, i: number) => ({ url, position: i }))
          : [],
      },
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { select: { id: true, url: true, position: true } },
      variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
    },
  });

  // Create variants if provided
  if (Array.isArray(body.variants) && body.variants.length > 0) {
    const variantData = body.variants.map((v: Record<string, unknown>) => ({
      productId: product.id,
      sku: (v.sku as string)?.trim() || null,
      color: (v.color as string)?.trim() || null,
      size: (v.size as string)?.trim() || null,
      weight: v.weight != null ? Number(v.weight) : null,
      priceOverride: v.priceOverride != null ? Number(v.priceOverride) : null,
      stockQuantity: Number(v.stockQuantity ?? 0),
    }));
    await prisma.productVariant.createMany({ data: variantData });

    // Re-fetch with variants
    const updated = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { select: { id: true, url: true, position: true } },
        variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
      },
    });
    return jsonCreated(serializeProduct(updated as NonNullable<typeof updated>));
  }

  return jsonCreated(serializeProduct(product));
});
