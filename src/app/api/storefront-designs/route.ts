// SHOPORA — /api/storefront-designs
//
//   GET  — list the current business's designs (tenant-scoped; slim payload
//          including canvas + elements so the Design Studio home can render
//          live thumbnails without an extra fetch).
//   POST — create a new design: from a template id, from a submitted document,
//          or from a blank canvas. businessId is ALWAYS taken from the verified
//          session — a client-supplied businessId is ignored.
//
// Authorization (server-side, never UI-only):
//   • reads   require settings.read
//   • writes  require settings.write
//   • every query is scoped `{ id/businessId: ctx.businessId }`, so Merchant A
//     can neither see nor touch Merchant B's rows (a foreign id is simply 404).
//   • requireAuthHandler additionally applies the subscription write-gate
//     (423 when cancelled) and the Phase 10 impersonation guard.

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import prisma from '@/lib/prisma';
import { sanitizeDesignDoc, blankDoc, type StorefrontDesignDoc } from '@/lib/storefront-design/types';
import { applyTemplate } from '@/lib/storefront-design/templates';
import { serializeDesign } from '@/lib/storefront-design/serialize';

export const GET = requireAuthHandler(async (_request: NextRequest) => {
  requirePermission('settings.read');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  const rows = await prisma.storefrontDesign.findMany({
    where: { businessId: ctx.businessId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return jsonOk({ designs: rows.map(serializeDesign) });
});

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('settings.write');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  let doc: StorefrontDesignDoc = blankDoc();
  const templateId = typeof body.templateId === 'string' ? body.templateId : null;

  if (templateId) {
    const fromTemplate = applyTemplate(templateId);
    if (!fromTemplate) return authErrors.badRequest('Unknown template');
    doc = fromTemplate;
  } else if ('canvas' in body || 'elements' in body) {
    const result = sanitizeDesignDoc({ canvas: body.canvas, elements: body.elements });
    if (!result.ok) return jsonError(result.errors.join('; '), 422);
    doc = result.doc;
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : templateId
        ? `Design from ${templateId}`
        : 'Untitled design';

  const row = await prisma.storefrontDesign.create({
    data: {
      businessId: ctx.businessId,
      name,
      canvas: doc.canvas as never,
      elements: doc.elements as never,
    },
  });

  return jsonCreated(serializeDesign(row));
});