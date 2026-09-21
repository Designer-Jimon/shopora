// SHOPORA — /api/admin/platform/roles
// List platform roles + their permissions (read-only; drives the admins page).
// Permission: platform.admins.manage.

import type { NextRequest } from 'next/server';
import { jsonOk } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const GET = withAdminHandler('platform.admins.manage', async () => {
  const roles = await prisma.role.findMany({
    where: { platformStaff: { some: {} } },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' },
  });

  // Include platform roles even if no staff member has them yet (fresh DB).
  const platformRoleNames = ['Platform Super Admin', 'Platform Admin'];
  const extras = await prisma.role.findMany({
    where: { name: { in: platformRoleNames, not: { in: roles.map((r) => r.name) } } },
    include: { permissions: { include: { permission: true } } },
  });

  const all = [...roles, ...extras];
  return jsonOk({
    roles: all.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((rp) => rp.permission.name),
    })),
  });
});