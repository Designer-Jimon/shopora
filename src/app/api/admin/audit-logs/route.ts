// SHOPORA — GET /api/admin/audit-logs
// Platform audit trail viewer. Filters: ?action=&businessId=&actorUserId=
// &q=(target)&page=&pageSize=. Permission: platform.audit.read.

import { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const GET = withAdminHandler('platform.audit.read', async (request: NextRequest) => {
  const url = request.nextUrl;
  const action = url.searchParams.get('action') ?? '';
  const businessId = url.searchParams.get('businessId') ?? '';
  const actorUserId = url.searchParams.get('actorUserId') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (businessId) where.businessId = businessId;
  if (actorUserId) where.actorUserId = actorUserId;
  if (q) where.target = { contains: q, mode: 'insensitive' };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
        business: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const actions = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
  });

  return jsonOk({
    logs: rows.map((l) => ({
      id: l.id,
      action: l.action,
      target: l.target,
      metadata: l.metadataJson,
      createdAt: l.createdAt,
      actor: l.actor ? { email: l.actor.email, name: `${l.actor.firstName} ${l.actor.lastName}`.trim() } : null,
      business: l.business ? { id: l.business.id, name: l.business.name, slug: l.business.slug } : null,
    })),
    actions: actions.map((a) => a.action),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});