// SHOPORA — /api/admin/platform/admins/[id]
//   PATCH  — update a platform admin (role, isActive, user isActive toggle)
//   DELETE — remove platform membership entirely
// Protections: cannot deactivate/demote the LAST active Super Admin; an admin
// cannot act on their own membership (must be changed by another admin).

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export const PATCH = withAdminHandler('platform.admins.manage', async (request: NextRequest, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const staff = await prisma.platformStaff.findUnique({
    where: { id },
    include: { role: true, user: { select: { email: true, id: true } } },
  });
  if (!staff) return authErrors.notFound('Platform admin not found');

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const data: Record<string, unknown> = {};
  const currentRoleIsSuper = staff.role.name === 'Platform Super Admin';

  if (body.isActive !== undefined) {
    const nextActive = body.isActive === true || body.isActive === 'true';

    if (staff.userId === admin.userId) {
      return jsonError('You cannot change your own platform membership', 409);
    }
    if (currentRoleIsSuper && !nextActive) {
      const superCount = await prisma.platformStaff.count({
        where: { role: { name: 'Platform Super Admin' }, isActive: true },
      });
      if (superCount <= 1) {
        return jsonError('Cannot remove the last active Super Admin', 409);
      }
    }
    data.isActive = nextActive;
  }

  if (body.roleId !== undefined) {
    if (staff.userId === admin.userId) {
      return jsonError('You cannot change your own role', 409);
    }
    const role = await prisma.role.findUnique({ where: { id: String(body.roleId) } });
    if (!role) return authErrors.notFound('Role not found');

    const demotingToNonSuper = currentRoleIsSuper && role.name !== 'Platform Super Admin';
    if (demotingToNonSuper) {
      const superCount = await prisma.platformStaff.count({
        where: { role: { name: 'Platform Super Admin' }, isActive: true },
      });
      if (superCount <= 1) {
        return jsonError('Cannot demote the last Super Admin', 409);
      }
    }
    data.roleId = role.id;
  }

  if (body.userIsActive !== undefined) {
    data.userIsActive = body.userIsActive === true || body.userIsActive === 'true';
  }

  if (Object.keys(data).length === 0) return jsonOk({ changed: false });

  const updated = await prisma.platformStaff.update({
    where: { id },
    data: {
      isActive: data.isActive ?? undefined,
      roleId: data.roleId ?? undefined,
    },
  });
  if (String(data.userIsActive ?? '') !== '') {
    await prisma.user.update({
      where: { id: staff.user.id },
      data: { isActive: data.userIsActive === true },
    });
  }

  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'platform_admin.update',
    target: staff.user.email,
    metadata: { ...data, previousRole: staff.role.name },
  });

  return jsonOk({ changed: true, id: updated.id, isActive: updated.isActive });
});

export const DELETE = withAdminHandler('platform.admins.manage', async (_req, ctx) => {
  const admin = requireAuth();
  const id = String((ctx.params as Record<string, string>).id ?? '');
  const staff = await prisma.platformStaff.findUnique({
    where: { id },
    include: { role: true, user: { select: { email: true, id: true } } },
  });
  if (!staff) return authErrors.notFound('Platform admin not found');

  if (staff.userId === admin.userId) {
    return jsonError('You cannot remove your own platform membership', 409);
  }
  if (staff.role.name === 'Platform Super Admin' && staff.isActive) {
    const superCount = await prisma.platformStaff.count({
      where: { role: { name: 'Platform Super Admin' }, isActive: true },
    });
    if (superCount <= 1) {
      return jsonError('Cannot remove the last Super Admin', 409);
    }
  }

  await prisma.platformStaff.delete({ where: { id } });
  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'platform_admin.revoke',
    target: staff.user.email,
    metadata: { role: staff.role.name },
  });
  return jsonOk({ removed: true });
});