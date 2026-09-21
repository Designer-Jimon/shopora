// SHOPORA — /api/admin/platform/admins
//   GET  — list all platform staff (user, role, active)
//   POST — grant platform-admin membership by email + role (idempotent)

import { NextRequest } from 'next/server';
import { jsonOk, jsonCreated, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { validateEmail, validateRequired } from '@/lib/validate';
import { writeAuditLog } from '@/lib/audit';

export const GET = withAdminHandler('platform.admins.manage', async () => {
  const rows = await prisma.platformStaff.findMany({
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
      role: { select: { id: true, name: true, description: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return jsonOk({
    admins: rows.map((s) => ({
      id: s.id,
      userId: s.userId,
      email: s.user.email,
      name: `${s.user.firstName} ${s.user.lastName}`.trim(),
      userIsActive: s.user.isActive,
      roleId: s.roleId,
      roleName: s.role.name,
      isActive: s.isActive,
      createdAt: s.createdAt,
    })),
  });
});

export const POST = withAdminHandler('platform.admins.manage', async (request: NextRequest) => {
  const admin = requireAuth();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const roleId = typeof body.roleId === 'string' ? body.roleId.trim() : '';

  const emailErr = validateEmail(email);
  if (emailErr) return authErrors.badRequest(emailErr);
  if (validateRequired(roleId, 'Role')) return authErrors.badRequest('roleId is required');

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return authErrors.notFound('Role not found');

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        firstName: String(body.firstName ?? 'Platform'),
        lastName: String(body.lastName ?? 'User'),
        // No usable password — the admin invites them; they use reset-password
        // to set one. Hash is a random token, unusable for login.
        passwordHash: `!no-login-${Math.random().toString(36).slice(2)}`,
        isActive: true,
      },
    });
  }

  const staff = await prisma.platformStaff.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: { isActive: true },
    create: { userId: user.id, roleId: role.id, isActive: true },
  });

  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'platform_admin.grant',
    target: email,
    metadata: { role: role.name },
  });

  return jsonCreated({
    id: staff.id,
    userId: user.id,
    email: user.email,
    roleName: role.name,
    note: !user.passwordHash.startsWith('!no-login')
      ? null
      : 'Account created without a password — the invitee must use password reset to set one.',
  });
});