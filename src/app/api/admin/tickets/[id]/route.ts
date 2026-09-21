// SHOPORA — PATCH /api/admin/tickets/[id]
// Update a support ticket: status, priority, assignee (or reopen).

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

const VALID_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export const PATCH = withAdminHandler('platform.tickets.manage', async (request: NextRequest, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return authErrors.notFound('Ticket not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(String(body.status))) return jsonError('Invalid status', 422);
    data.status = String(body.status);
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITIES.has(String(body.priority))) return jsonError('Invalid priority', 422);
    data.priority = String(body.priority);
  }
  if (body.assigneeUserId !== undefined) {
    data.assigneeUserId = body.assigneeUserId === null ? null : String(body.assigneeUserId);
  }

  const updated = await prisma.supportTicket.update({ where: { id }, data });
  await writeAuditLog({
    actorUserId: admin.userId,
    businessId: ticket.businessId,
    action: 'ticket.update',
    target: id,
    metadata: data,
  });
  return jsonOk({ id: updated.id, status: updated.status, priority: updated.priority, assigneeUserId: updated.assigneeUserId });
});