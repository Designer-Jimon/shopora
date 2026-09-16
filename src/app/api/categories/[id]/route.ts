// SHOPORA — /api/categories/[id]
//   PATCH — update category
//   DELETE — delete category

import { NextRequest } from 'next/server';
import { jsonOk, jsonNoContent, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { slugify } from '@/lib/validate';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = requireAuthHandler(async (request: NextRequest, context: unknown) => {
  requirePermission('products.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const existing = await prisma.category.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!existing) return authErrors.notFound('Category not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const errors: { field: string; message: string }[] = [];
  const data: Record<string, unknown> = {};

  if ('name' in body) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      errors.push({ field: 'name', message: 'Category name is required' });
    } else {
      data.name = (body.name as string).trim();
      if (data.name !== existing.name) {
        let slug = slugify(data.name as string) || 'category';
        let counter = 2;
        while (
          await prisma.category.findFirst({
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

  if ('description' in body) {
    data.description = typeof body.description === 'string' ? (body.description as string).trim() || null : null;
  }

  if ('parentId' in body) {
    if (body.parentId && body.parentId === id) {
      errors.push({ field: 'parentId', message: 'A category cannot be its own parent' });
    } else if (body.parentId) {
      const parent = await prisma.category.findFirst({ where: { id: body.parentId as string, businessId: ctx.businessId } });
      if (!parent) errors.push({ field: 'parentId', message: 'Parent category not found' });
      else data.parentId = body.parentId;
    } else {
      data.parentId = null;
    }
  }

  if (errors.length > 0) return jsonError('Validation failed', 422);

  const updated = await prisma.category.update({ where: { id }, data: data as never });
  return jsonOk(updated);
});

export const DELETE = requireAuthHandler(async (_request: NextRequest, context: unknown) => {
  requirePermission('products.delete');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const category = await prisma.category.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!category) return authErrors.notFound('Category not found');

  await prisma.category.delete({ where: { id } });
  return jsonNoContent();
});
