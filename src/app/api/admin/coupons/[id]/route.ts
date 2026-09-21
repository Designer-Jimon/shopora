// SHOPORA — /api/admin/coupons/[id]
//   PATCH  — update coupon (value, caps, dates, active toggle)
//   DELETE — remove a coupon permanently

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export const PATCH = withAdminHandler('platform.coupons.manage', async (request: NextRequest, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return authErrors.notFound('Coupon not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const data: Record<string, unknown> = {};
  if (body.value !== undefined) {
    const v = typeof body.value === 'number' ? body.value : Number(body.value);
    if (!Number.isFinite(v) || v <= 0) return jsonError('value must be a positive number', 422);
    if (coupon.kind === 'percentage' && v > 100) return jsonError('Percentage value cannot exceed 100', 422);
    data.value = v;
  }
  if (body.minOrderAmount !== undefined) {
    if (body.minOrderAmount === null) data.minOrderAmount = null;
    else {
      const v = Number(body.minOrderAmount);
      if (!Number.isFinite(v) || v < 0) return jsonError('minOrderAmount must be non-negative', 422);
      data.minOrderAmount = v;
    }
  }
  if (body.maxUses !== undefined) {
    if (body.maxUses === null) data.maxUses = null;
    else {
      const v = Number(body.maxUses);
      if (!Number.isInteger(v) || v < 1) return jsonError('maxUses must be a positive integer', 422);
      data.maxUses = v;
    }
  }
  if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';
  for (const [k, v] of [['startsAt', body.startsAt], ['expiresAt', body.expiresAt]] as const) {
    if (v === undefined) continue;
    if (v === null || v === '') { data[k] = null; continue; }
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return jsonError(`${k} is not a valid date`, 422);
    data[k] = d;
  }

  const updated = await prisma.coupon.update({ where: { id }, data });
  await writeAuditLog({ actorUserId: admin.userId, action: 'coupon.update', target: coupon.code, metadata: data });
  return jsonOk({ id: updated.id, code: updated.code, value: Number(updated.value), isActive: updated.isActive });
});

export const DELETE = withAdminHandler('platform.coupons.manage', async (_req, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return authErrors.notFound('Coupon not found');
  await prisma.coupon.delete({ where: { id } });
  await writeAuditLog({ actorUserId: admin.userId, action: 'coupon.delete', target: coupon.code });
  return jsonOk({ deleted: true });
});