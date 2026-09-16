// SHOPORA — /api/categories
//   GET  — list categories (flat, or tree via ?tree=1)
//   POST — create category

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { getCategoryTree } from '@/lib/catalog';
import prisma from '@/lib/prisma';
import { slugify, validateRequired } from '@/lib/validate';

export const GET = requireAuthHandler(async (request: NextRequest) => {
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const sp = new URL(request.url).searchParams;
  const tree = sp.get('tree') === '1';

  if (tree) {
    const categories = await getCategoryTree(ctx.businessId);
    return jsonOk(categories);
  }

  const categories = await prisma.category.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true, children: true } } },
  });
  return jsonOk(categories);
});

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('products.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const errors: { field: string; message: string }[] = [];
  if (validateRequired(body.name, 'Category name')) {
    errors.push({ field: 'name', message: 'Category name is required' });
  }

  if (body.parentId && typeof body.parentId === 'string') {
    const parent = await prisma.category.findFirst({ where: { id: body.parentId, businessId: ctx.businessId } });
    if (!parent) errors.push({ field: 'parentId', message: 'Parent category not found' });
  }

  if (errors.length > 0) return jsonError('Validation failed', 422);

  let slug = slugify(body.name as string) || 'category';
  let counter = 2;
  while (await prisma.category.findFirst({ where: { businessId: ctx.businessId, slug } })) {
    slug = `${slugify(body.name as string)}-${counter}`;
    counter++;
  }

  const category = await prisma.category.create({
    data: {
      businessId: ctx.businessId,
      name: (body.name as string).trim(),
      slug,
      description: (body.description as string)?.trim() || null,
      parentId: (body.parentId as string) || null,
    },
  });

  return jsonCreated(category);
});
