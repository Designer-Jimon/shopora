// SHOPORA — /api/admin/subscriptions/plans/[id]
//   GET    — single plan detail
//   PATCH  — edit price/limits/flags (name is immutable — it's the stable key)
//   DELETE — archive (isActive=false) if no business is actively on it

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export const GET = withAdminHandler('platform.plans.manage', async (_req, ctx) => {
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return authErrors.notFound('Plan not found');
  return jsonOk({
    plan: {
      id: plan.id,
      name: plan.name,
      displayName: plan.displayName,
      description: plan.description,
      monthlyPriceNaira: Number(plan.monthlyPriceNaira),
      annualPriceNaira: Number(plan.annualPriceNaira),
      productLimit: plan.productLimit,
      staffLimit: plan.staffLimit,
      orderLimit: plan.orderLimit,
      customDomain: plan.customDomain,
      removeBranding: plan.removeBranding,
      analyticsTier: plan.analyticsTier,
      isActive: plan.isActive,
      paystackPlanCode: plan.paystackPlanCode,
      sortOrder: plan.sortOrder,
      subscriberCount: plan._count.subscriptions,
    },
  });
});

export const PATCH = withAdminHandler('platform.plans.manage', async (request: NextRequest, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) return authErrors.notFound('Plan not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const data: Record<string, unknown> = {};
  if (typeof body.displayName === 'string') data.displayName = body.displayName.trim();
  if (typeof body.description === 'string') data.description = body.description.trim();
  for (const [key, raw] of [['monthlyPriceNaira', body.monthlyPriceNaira], ['annualPriceNaira', body.annualPriceNaira]] as const) {
    if (raw === undefined) continue;
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(v) || v < 0) return jsonError('Prices must be non-negative numbers', 422);
    data[key] = v;
  }
  for (const [key, raw] of [['productLimit', body.productLimit], ['staffLimit', body.staffLimit], ['orderLimit', body.orderLimit], ['sortOrder', body.sortOrder]] as const) {
    if (raw === undefined) continue;
    const v = Number(raw);
    if (!Number.isInteger(v) || v < 0) return jsonError(`${key} must be a non-negative integer`, 422);
    data[key] = v;
  }
  if (body.customDomain !== undefined) data.customDomain = body.customDomain === true || body.customDomain === 'true';
  if (body.removeBranding !== undefined) data.removeBranding = body.removeBranding === true || body.removeBranding === 'true';
  if (body.analyticsTier !== undefined) {
    if (!['basic', 'advanced'].includes(String(body.analyticsTier))) return jsonError('analyticsTier must be basic or advanced', 422);
    data.analyticsTier = String(body.analyticsTier);
  }
  if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';

  const updated = await prisma.subscriptionPlan.update({ where: { id }, data });
  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'plan.update',
    target: plan.name,
    metadata: Object.keys(data).length ? data : null,
  });
  return jsonOk({ id: updated.id, name: updated.name, displayName: updated.displayName, isActive: updated.isActive });
});

export const DELETE = withAdminHandler('platform.plans.manage', async (_req, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return authErrors.notFound('Plan not found');

  const activeSubs = await prisma.subscription.count({
    where: { planId: plan.id, status: { not: 'cancelled' } },
  });
  if (activeSubs > 0) {
    return jsonError(`Cannot archive this plan — ${activeSubs} business(es) are still on it.`, 409);
  }

  const archived = await prisma.subscriptionPlan.update({
    where: { id },
    data: { isActive: false },
  });
  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'plan.archive',
    target: plan.name,
    metadata: { isActive: false },
  });
  return jsonOk({ id: archived.id, isActive: archived.isActive, message: 'Plan archived' });
});