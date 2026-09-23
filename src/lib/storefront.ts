// SHOPORA storefront server helpers — PUBLIC, read-only tenant resolution for
// the customer-facing storefront. This is the most public tenant-isolation
// surface in the app: every query here is strictly scoped by the businessId
// resolved from the URL slug, and only ever exposes status='active' rows.

import prisma from '@/lib/prisma';
import { cache } from 'react';
import { resolveTheme, type BusinessTheme } from '@/lib/theme';
import { serializeProduct, type SerializedProduct } from '@/lib/catalog';

export type StorefrontBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  theme: BusinessTheme;
};

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Resolve a tenant by its public slug. Returns null (→ notFound) when the slug
 * is malformed, the business does not exist, or it is not active. Theme is
 * merged over the code defaults via resolveTheme.
 *
 * Wrapped in React `cache()`: the storefront layout calls this from
 * generateMetadata + generateViewport + the layout body in the SAME render
 * pass, so dedupe turns 3 DB round-trips into 1.
 */
export const getStorefrontBusiness = cache(
  async (slugRaw: string): Promise<StorefrontBusiness | null> => {
    const slug = slugRaw.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug)) return null;

    const biz = await prisma.business.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        category: true,
        phone: true,
        whatsappNumber: true,
        address: true,
        logoUrl: true,
        bannerUrl: true,
        themeConfig: true,
        isActive: true,
      },
    });

    if (!biz || !biz.isActive) return null;

    return {
      id: biz.id,
      name: biz.name,
      slug: biz.slug,
      description: biz.description,
      category: biz.category,
      phone: biz.phone,
      whatsappNumber: biz.whatsappNumber,
      address: biz.address,
      logoUrl: biz.logoUrl,
      bannerUrl: biz.bannerUrl,
      theme: resolveTheme(biz.themeConfig),
    };
  },
);

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  images: { select: { id: true, url: true, position: true } },
  variants: {
    select: {
      id: true,
      sku: true,
      color: true,
      size: true,
      weight: true,
      priceOverride: true,
      stockQuantity: true,
    },
  },
} as const;

export type StorefrontListParams = {
  businessId: string;
  q?: string;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type StorefrontListResult = {
  products: SerializedProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const SORTS = new Set(['newest', 'price_asc', 'price_desc']);

/**
 * Public product listing. Only active products of the given business. The
 * effective price (discountPrice ?? price) drives price range + sort; total
 * reflects ALL matching products. Catalog size is bounded by the Phase 9
 * product_limit stub (≤50), so in-memory filtering after one scoped query is
 * fine at this scale and keeps the effective-price semantics exact.
 */
export async function listStorefrontProducts(
  params: StorefrontListParams,
): Promise<StorefrontListResult> {
  const { businessId, q, categoryId, minPrice, maxPrice } = params;
  const sort = params.sort && SORTS.has(params.sort) ? (params.sort as string) : 'newest';
  const pageSize = Math.min(48, Math.max(1, params.pageSize ?? 12));
  const page = Math.max(1, Math.floor(params.page ?? 1));

  const where: Record<string, unknown> = { businessId, status: 'active' };
  if (q) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { brand: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;

  const rows = await prisma.product.findMany({
    where,
    include: PRODUCT_INCLUDE,
  });

  let list = rows.map((r) => serializeProduct(r));

  if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
    list = list.filter((p) => {
      const eff = p.discountPrice ?? p.price;
      if (typeof minPrice === 'number' && eff < minPrice) return false;
      if (typeof maxPrice === 'number' && eff > maxPrice) return false;
      return true;
    });
  }

  const eff = (p: SerializedProduct) => p.discountPrice ?? p.price;
  if (sort === 'price_asc') list.sort((a, b) => eff(a) - eff(b));
  else if (sort === 'price_desc') list.sort((a, b) => eff(b) - eff(a));
  else list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    products: list.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/** Newest active products for the storefront (homepage "New arrivals"). */
export async function listNewArrivals(businessId: string, take = 8): Promise<SerializedProduct[]> {
  const result = await listStorefrontProducts({ businessId, sort: 'newest', pageSize: take });
  return result.products;
}

/** Categories that currently have at least one active product. */
export type StorefrontCategory = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export async function listStorefrontCategories(businessId: string): Promise<StorefrontCategory[]> {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { businessId, status: 'active', categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countsMap = new Map<string, number>();
  for (const row of counts) {
    if (row.categoryId) countsMap.set(row.categoryId, row._count._all);
  }

  return categories
    .filter((c) => (countsMap.get(c.id) ?? 0) > 0)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug, productCount: countsMap.get(c.id) ?? 0 }));
}

/** Single active product by slug within a business (null → 404). */
export async function getStorefrontProduct(
  businessId: string,
  productSlug: string,
): Promise<SerializedProduct | null> {
  if (!productSlug.trim()) return null;
  const row = await prisma.product.findFirst({
    where: { businessId, slug: productSlug.trim(), status: 'active' },
    include: PRODUCT_INCLUDE,
  });
  return row ? serializeProduct(row) : null;
}