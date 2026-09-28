// SHOPORA — /api/storefront-designs/[id]
//
//   GET    — fetch one design (tenant-scoped; any foreign id → 404).
//   PATCH  — update name, canvas, elements (validated + sanitized server-side).
//   DELETE — remove a design (tenant-scoped → 404 for foreign ids).
//
// Same authorization shape as the collection route: settings.read on GET,
// settings.write on mutations, businessId ALWAYS from the verified session.

import { NextRequest } from 'next/server';
import { jsonOk, jsonNoContent, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { sanitizeDesignDoc } from '@/lib/storefront-design/types';
import { serializeDesign } from '@/lib/storefront-design/serialize';

type Ctx = { params: Promise<{ id: string }> };

export const GET = requireAuthHandler(async (_request: NextRequest, context: unknown) => {
  requirePermission('settings.read');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const row = await prisma.storefrontDesign.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!row) return authErrors.notFound('Design not found');

  return jsonOk(serializeDesign(row));
});

export const PATCH = requireAuthHandler(async (request: NextRequest, context: unknown) => {
  requirePermission('settings.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const row = await prisma.storefrontDesign.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!row) return authErrors.notFound('Design not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const data: Record<string, unknown> = {};

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return authErrors.badRequest('Design name is required');
    data.name = name.slice(0, 120);
  }

  if ('canvas' in body || 'elements' in body) {
    const result = sanitizeDesignDoc({ canvas: body.canvas ?? row.canvas, elements: body.elements ?? row.elements });
    if (!result.ok) return jsonError(result.errors.join('; '), 422);
    data.canvas = result.doc.canvas as never;
    data.elements = result.doc.elements as never;
  }

  let statusChange: 'draft' | 'published' | null = null;
  if ('status' in body) {
    const status = body.status as string;
    if (!['draft', 'published'].includes(status)) return authErrors.badRequest('Status must be draft or published');
    data.status = status;
    statusChange = status as 'draft' | 'published';
    // Part 2 state machine: only ONE design per business is live.
    //   • publish → set publishedAt on first publish + demote any other
    //     currently-published design back to draft,
    //   • unpublish → clear publishedAt so the storefront falls back to the
    //     default hero until something is published again.
    if (status === 'published') {
      if (!row.publishedAt) data.publishedAt = new Date();
    } else {
      data.publishedAt = null;
    }
  }

  let updated: Awaited<ReturnType<typeof prisma.storefrontDesign.update>>;
  if (statusChange === 'published') {
    updated = await prisma.$transaction(async (tx) => {
      await tx.storefrontDesign.updateMany({
        where: { businessId: ctx.businessId, status: 'published', id: { not: row.id } },
        data: { status: 'draft', publishedAt: null },
      });
      return tx.storefrontDesign.update({ where: { id: row.id }, data });
    });
  } else {
    updated = await prisma.storefrontDesign.update({ where: { id: row.id }, data });
  }

  return jsonOk(serializeDesign(updated));
});

export const DELETE = requireAuthHandler(async (_request: NextRequest, context: unknown) => {
  requirePermission('settings.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();
  const { id } = await (context as Ctx).params;

  const row = await prisma.storefrontDesign.findFirst({ where: { id, businessId: ctx.businessId } });
  if (!row) return authErrors.notFound('Design not found');

  await prisma.storefrontDesign.delete({ where: { id } });
  return jsonNoContent();
});