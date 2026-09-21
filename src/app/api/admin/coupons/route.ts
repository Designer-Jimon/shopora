// SHOPORA — /api/admin/coupons
//   GET  — list platform coupons
//   POST — create a coupon (code unique, kind percentage|fixed, value, caps)

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

const VALID_KINDS = new Set(['percentage', 'fixed']);

function parseMoney(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export const GET = withAdminHandler('platform.coupons.manage', async (request: NextRequest) => {
  const url = request.nextUrl;
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const where: Record<string, unknown> = {};
  if (q) where.code = { contains: q.toUpperCase(), mode: 'insensitive' };

  const [rows, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.coupon.count({ where }),
  ]);

  return jsonOk({
    coupons: rows.map((c) => ({
      id: c.id,
      code: c.code,
      kind: c.kind,
      value: Number(c.value),
      minOrderAmount: c.minOrderAmount === null ? null : Number(c.minOrderAmount),
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      startsAt: c.startsAt,
      expiresAt: c.expiresAt,
      isActive: c.isActive,
      createdAt: c.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export const POST = withAdminHandler('platform.coupons.manage', async (request: NextRequest) => {
  const admin = requireAuth();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const kind = VALID_KINDS.has(String(body.kind)) ? String(body.kind) : '';
  const value = parseMoney(body.value);
  const minOrderAmount = body.minOrderAmount === undefined || body.minOrderAmount === null ? null : parseMoney(body.minOrderAmount);

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return jsonError('Code must be 3–32 chars: letters, digits, _ or -', 422);
  if (!kind) return jsonError('kind must be percentage or fixed', 422);
  if (value === null || value <= 0) return jsonError('value must be a positive number', 422);
  if (kind === 'percentage' && value > 100) return jsonError('Percentage value cannot exceed 100', 422);

  let startsAt: Date | null = null;
  let expiresAt: Date | null = null;
  for (const [k, v] of [['startsAt', body.startsAt], ['expiresAt', body.expiresAt]] as const) {
    if (v === undefined || v === null || v === '') continue;
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return jsonError(`${k} is not a valid date`, 422);
    if (k === 'startsAt') startsAt = d; else expiresAt = d;
  }

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) return authErrors.conflict('A coupon with this code already exists');

  const coupon = await prisma.coupon.create({
    data: {
      code,
      kind,
      value,
      isActive: body.isActive !== false,
      minOrderAmount: minOrderAmount ?? undefined,
      maxUses: body.maxUses !== undefined && Number.isInteger(Number(body.maxUses)) && Number(body.maxUses) >= 1 ? Number(body.maxUses) : undefined,
      startsAt: startsAt ?? undefined,
      expiresAt: expiresAt ?? undefined,
    },
  });
  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'coupon.create',
    target: code,
    metadata: { kind, value },
  });
  return jsonCreated({ id: coupon.id, code: coupon.code, kind: coupon.kind, value: Number(coupon.value) });
});