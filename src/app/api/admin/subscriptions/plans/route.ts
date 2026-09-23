// SHOPORA — /api/admin/subscriptions/plans
//   GET  — list all plans (active + archived), with active-subscription counts
//   POST — create a new SubscriptionPlan (admin-editable catalogue, Phase 10).
//          Seeding is now create-only (see ensurePlansSeeded), so edits made
//          here are never overwritten.

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { validateRequired } from '@/lib/validate';
import { writeAuditLog } from '@/lib/audit';

function planPayload(body: Record<string, unknown>) {
  const monthlyPriceNaira = typeof body.monthlyPriceNaira === 'number' ? body.monthlyPriceNaira : Number(body.monthlyPriceNaira);
  const annualPriceNaira = typeof body.annualPriceNaira === 'number' ? body.annualPriceNaira : Number(body.annualPriceNaira);
  const productLimit = Number(body.productLimit);
  const staffLimit = Number(body.staffLimit);
  const orderLimit = body.orderLimit === undefined ? 50 : Number(body.orderLimit);
  return {
    name: typeof body.name === 'string' ? body.name.trim().toLowerCase() : '',
    displayName: typeof body.displayName === 'string' ? body.displayName.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    monthlyPriceNaira,
    annualPriceNaira,
    productLimit,
    staffLimit,
    orderLimit,
    customDomain: body.customDomain === true || body.customDomain === 'true',
    removeBranding: body.removeBranding === true || body.removeBranding === 'true',
    analyticsTier: ['basic', 'advanced'].includes(String(body.analyticsTier)) ? String(body.analyticsTier) : 'basic',
    sortOrder: Number(body.sortOrder) || 0,
  };
}

function planErrors(p: ReturnType<typeof planPayload>): string[] {
  const errors: string[] = [];
  if (validateRequired(p.name, 'Name')) errors.push('Name is required (lowercase key)');
  else if (!/^[a-z0-9-]+$/.test(p.name)) errors.push('Name must be lowercase alphanumeric with hyphens');
  if (validateRequired(p.displayName, 'Display name')) errors.push('Display name is required');
  if (!Number.isFinite(p.monthlyPriceNaira) || p.monthlyPriceNaira < 0) errors.push('Monthly price must be a non-negative number');
  if (!Number.isFinite(p.annualPriceNaira) || p.annualPriceNaira < 0) errors.push('Annual price must be a non-negative number');
  if (!Number.isInteger(p.productLimit) || p.productLimit < 0) errors.push('Product limit must be a non-negative integer');
  if (!Number.isInteger(p.staffLimit) || p.staffLimit < 0) errors.push('Staff limit must be a non-negative integer');
  if (!Number.isInteger(p.orderLimit) || p.orderLimit < 0) errors.push('Order limit must be a non-negative integer');
  return errors;
}

export const GET = withAdminHandler('platform.plans.manage', async () => {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return jsonOk({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      monthlyPriceNaira: Number(p.monthlyPriceNaira),
      annualPriceNaira: Number(p.annualPriceNaira),
      productLimit: p.productLimit,
      staffLimit: p.staffLimit,
      orderLimit: p.orderLimit,
      customDomain: p.customDomain,
      removeBranding: p.removeBranding,
      analyticsTier: p.analyticsTier,
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      subscriberCount: p._count.subscriptions,
    })),
  });
});

export const POST = withAdminHandler('platform.plans.manage', async (request: NextRequest) => {
  const admin = requireAuth();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const p = planPayload(body);
  const errors = planErrors(p);
  if (errors.length > 0) return jsonError(errors.join('; '), 422);

  const existing = await prisma.subscriptionPlan.findUnique({ where: { name: p.name } });
  if (existing) return authErrors.conflict('A plan with this name already exists');

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      monthlyPriceNaira: p.monthlyPriceNaira,
      annualPriceNaira: p.annualPriceNaira,
      productLimit: p.productLimit,
      staffLimit: p.staffLimit,
      orderLimit: p.orderLimit,
      customDomain: p.customDomain,
      removeBranding: p.removeBranding,
      analyticsTier: p.analyticsTier,
      sortOrder: p.sortOrder,
      isActive: true,
    },
  });

  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'plan.create',
    target: p.name,
    metadata: { displayName: p.displayName, monthlyPriceNaira: p.monthlyPriceNaira },
  });

  return jsonCreated({ id: plan.id, name: plan.name, displayName: plan.displayName });
});