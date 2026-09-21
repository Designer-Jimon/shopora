// SHOPORA catalog server helpers — product/category/variant/inventory queries
// scoped by businessId. All functions in this file are SERVER-ONLY and take
// businessId from a verified session (never client input).

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';
import { getSubscriptionState } from '@/lib/subscriptions/state';

// ------------------------------------------------------------------
// Serialization helpers
// ------------------------------------------------------------------

export type SerializedProduct = {
  id: string;
  businessId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  price: number;
  discountPrice: number | null;
  status: string;
  stockQuantity: number;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string; slug: string } | null;
  images: { id: string; url: string; position: number }[];
  variants: SerializedVariant[];
  effectiveStock: number;
  lowStock: boolean;
  imageUrl: string | null;
};

export type SerializedVariant = {
  id: string;
  sku: string | null;
  color: string | null;
  size: string | null;
  weight: number | null;
  priceOverride: number | null;
  stockQuantity: number;
};

export function serializeDecimal(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  return Number(v);
}

export function serializeVariant(v: {
  id: string;
  sku: string | null;
  color: string | null;
  size: string | null;
  weight: unknown;
  priceOverride: unknown;
  stockQuantity: number;
}): SerializedVariant {
  return {
    id: v.id,
    sku: v.sku,
    color: v.color,
    size: v.size,
    weight: serializeDecimal(v.weight),
    priceOverride: serializeDecimal(v.priceOverride),
    stockQuantity: v.stockQuantity,
  };
}

export function serializeProduct(p: {
  id: string;
  businessId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string | null;
  brand: string | null;
  sku: string | null;
  price: unknown;
  discountPrice: unknown;
  status: string;
  stockQuantity: number;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string; slug: string } | null;
  images: { id: string; url: string; position: number }[];
  variants: { id: string; sku: string | null; color: string | null; size: string | null; weight: unknown; priceOverride: unknown; stockQuantity: number }[];
  _count?: { inventory: number };
}, lowStockThreshold = 5): SerializedProduct {
  const variantStock = p.variants.reduce((sum, v) => sum + v.stockQuantity, 0);
  const hasVariants = p.variants.length > 0;
  const effectiveStock = hasVariants ? variantStock : p.stockQuantity;
  const firstImage = p.images.sort((a, b) => a.position - b.position)[0];

  return {
    id: p.id,
    businessId: p.businessId,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    brand: p.brand,
    sku: p.sku,
    price: serializeDecimal(p.price) as number,
    discountPrice: serializeDecimal(p.discountPrice),
    status: p.status,
    stockQuantity: p.stockQuantity,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    category: p.category ?? null,
    images: p.images.sort((a, b) => a.position - b.position).map((i) => ({ id: i.id, url: i.url, position: i.position })),
    variants: p.variants.map(serializeVariant),
    effectiveStock,
    lowStock: effectiveStock <= lowStockThreshold,
    imageUrl: firstImage?.url ?? null,
  };
}

// ------------------------------------------------------------------
// Product list with search, filter, sort, pagination
// ------------------------------------------------------------------

export type ProductListParams = {
  businessId: string;
  q?: string;
  categoryId?: string;
  status?: string;
  stock?: 'low' | 'out';
  sort?: string;
  page?: number;
  pageSize?: number;
  lowStockThreshold?: number;
};

export type ProductListResult = {
  products: SerializedProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listProducts(params: ProductListParams): Promise<ProductListResult> {
  const {
    businessId,
    q,
    categoryId,
    status,
    stock,
    sort = 'newest',
    page = 1,
    pageSize = 25,
    lowStockThreshold = 5,
  } = params;

  const where: Record<string, unknown> = { businessId };

  if (q) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (categoryId) where.categoryId = categoryId;
  if (status) where.status = status;

  const orderBy: Prisma.ProductOrderByWithRelationInput = (() => {
    switch (sort) {
      case 'oldest': return { createdAt: 'asc' };
      case 'name': return { name: 'asc' };
      case 'price_asc': return { price: 'asc' };
      case 'price_desc': return { price: 'desc' };
      case 'stock_asc': return { stockQuantity: 'asc' };
      case 'stock_desc': return { stockQuantity: 'desc' };
      default: return { createdAt: 'desc' };
    }
  })();

  // The stock filter (low/out) depends on the computed effective stock
  // (variant sums), so it must be applied after fetching. When active, fetch
  // the full matching set, post-filter, THEN paginate so total/pages are right.
  if (stock === 'low' || stock === 'out') {
    const allRows = await prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { select: { id: true, url: true, position: true } },
        variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
      },
    });

    let filtered = allRows.map((r) => serializeProduct(r, lowStockThreshold));
    if (stock === 'low') {
      filtered = filtered.filter((p) => p.effectiveStock > 0 && p.effectiveStock <= lowStockThreshold);
    } else {
      filtered = filtered.filter((p) => p.effectiveStock === 0);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const safePage = Math.max(1, Math.min(page, totalPages || 1));
    const start = (safePage - 1) * pageSize;

    return {
      products: filtered.slice(start, start + pageSize),
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  const total = await prisma.product.count({ where });
  const totalPages = Math.ceil(total / pageSize);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const skip = (safePage - 1) * pageSize;

  const rows = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { select: { id: true, url: true, position: true } },
      variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
    },
  });

  const products = rows.map((r) => serializeProduct(r, lowStockThreshold));

  return {
    products,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

// ------------------------------------------------------------------
// Single product (with full details)
// ------------------------------------------------------------------

export async function getProduct(businessId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, businessId },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { select: { id: true, url: true, position: true }, orderBy: { position: 'asc' } },
      variants: { select: { id: true, sku: true, color: true, size: true, weight: true, priceOverride: true, stockQuantity: true } },
    },
  });
}

// ------------------------------------------------------------------
// Category helpers
// ------------------------------------------------------------------

export type CategoryWithChildren = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  _count: { products: number; children: number };
  children: CategoryWithChildren[];
};

export async function getCategoryTree(businessId: string): Promise<CategoryWithChildren[]> {
  const categories = await prisma.category.findMany({
    where: { businessId },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { products: true, children: true } },
    },
  });

  const byParent = new Map<string | null, typeof categories>();
  for (const c of categories) {
    const key = c.parentId;
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }

  function build(parentId: string | null): CategoryWithChildren[] {
    const items = byParent.get(parentId) ?? [];
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      parentId: item.parentId,
      _count: item._count,
      children: build(item.id),
    }));
  }

  return build(null);
}

// ------------------------------------------------------------------
// Inventory adjustment — writes an InventoryTransaction row then updates
// stock atomically. Never allows stock to go below zero.
// ------------------------------------------------------------------

export type InventoryAdjustInput = {
  businessId: string;
  productId: string;
  variantId?: string | null;
  changeQty: number;
  reason: string;
  createdById?: string;
};

export async function adjustInventory(input: InventoryAdjustInput) {
  const { businessId, productId, variantId, changeQty, reason, createdById } = input;

  if (!Number.isInteger(changeQty) || changeQty === 0) {
    throw new Error('changeQty must be a non-zero integer');
  }

  if (!reason.trim()) {
    throw new Error('reason is required');
  }

  return prisma.$transaction(async (tx) => {
    // Verify the product belongs to this business
    const product = await tx.product.findFirst({ where: { id: productId, businessId } });
    if (!product) throw new Error('Product not found');

    if (variantId) {
      const variant = await tx.productVariant.findFirst({ where: { id: variantId, productId } });
      if (!variant) throw new Error('Variant not found');

      const newQty = variant.stockQuantity + changeQty;
      if (newQty < 0) throw new Error('Stock cannot go below zero');

      await tx.productVariant.update({ where: { id: variantId }, data: { stockQuantity: newQty } });
    } else {
      const newQty = product.stockQuantity + changeQty;
      if (newQty < 0) throw new Error('Stock cannot go below zero');

      await tx.product.update({ where: { id: productId }, data: { stockQuantity: newQty } });
    }

    const transaction = await tx.inventoryTransaction.create({
      data: {
        businessId,
        productId,
        variantId: variantId ?? null,
        changeQty,
        reason: reason.trim(),
        createdById: createdById ?? null,
      },
    });

    return transaction;
  });
}

// ------------------------------------------------------------------
// Subscription product limit (Phase 9) — the cap comes from the business's
// active plan, not a hardcoded number.
// ------------------------------------------------------------------

// Emergency fallback when a subscription row is missing (shouldn't happen —
// getSubscriptionState provisions one lazily).
const FALLBACK_PRODUCT_LIMIT = parseInt(process.env.SUBSCRIPTION_PRODUCT_LIMIT ?? '50', 10);

export async function canCreateProduct(businessId: string): Promise<{ allowed: boolean; limit: number; current: number }> {
  const current = await prisma.product.count({ where: { businessId } });
  const state = await getSubscriptionState(businessId).catch(() => null);
  if (!state) return { allowed: current < FALLBACK_PRODUCT_LIMIT, limit: FALLBACK_PRODUCT_LIMIT, current };
  const limit = state.status === SUBSCRIPTION_STATUSES.cancelled ? 0 : state.productLimit;
  return { allowed: current < limit, limit, current };
}
