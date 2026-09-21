// SHOPORA — /api/admin/tickets
//   GET — list support tickets (?status=&priority=&q=&page=)
//   POST — file a ticket (subject/body/priority; optional businessId/userId)

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { validateRequired } from '@/lib/validate';
import { writeAuditLog } from '@/lib/audit';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export const GET = withAdminHandler('platform.tickets.manage', async (request: NextRequest) => {
  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? '';
  const priority = url.searchParams.get('priority') ?? '';
  const q = (url.searchParams.get('q') ?? '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '25', 10) || 25));

  const where: Record<string, unknown> = {};
  if (VALID_STATUSES.has(status)) where.status = status;
  if (VALID_PRIORITIES.has(priority)) where.priority = priority;
  if (q) where.OR = [
    { subject: { contains: q, mode: 'insensitive' } },
    { body: { contains: q, mode: 'insensitive' } },
  ];

  const [rows, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return jsonOk({
    tickets: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export const POST = withAdminHandler('platform.tickets.manage', async (request: NextRequest) => {
  const admin = requireAuth();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const ticketBody = typeof body.body === 'string' ? body.body.trim() : '';
  const priority = VALID_PRIORITIES.has(String(body.priority)) ? String(body.priority) : 'normal';
  const businessId = typeof body.businessId === 'string' ? body.businessId : null;
  const assigneeUserId = typeof body.assigneeUserId === 'string' && body.assigneeUserId ? body.assigneeUserId : null;

  if (validateRequired(subject, 'Subject')) return jsonError('Subject is required', 422);
  if (validateRequired(ticketBody, 'Body')) return jsonError('Body is required', 422);

  const ticket = await prisma.supportTicket.create({
    data: { subject, body: ticketBody, priority, businessId, userId: admin.userId, assigneeUserId },
  });
  await writeAuditLog({
    actorUserId: admin.userId,
    businessId,
    action: 'ticket.create',
    target: ticket.id,
    metadata: { subject, priority },
  });
  return jsonCreated({ id: ticket.id, subject: ticket.subject, status: ticket.status, priority: ticket.priority });
});