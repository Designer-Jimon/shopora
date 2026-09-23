// SHOPORA — DELETE /api/admin/settings/[key]

import { jsonOk, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit';

export const DELETE = withAdminHandler('platform.settings.manage', async (_req, ctx) => {
  const admin = requireAuth();
  const key = String((ctx.params as Record<string, string>).key ?? '');
  if (!key) return authErrors.badRequest('Key required');

  const existing = await prisma.platformSetting.findUnique({ where: { key } });
  if (!existing) return authErrors.notFound('Setting not found');

  await prisma.platformSetting.delete({ where: { key } });
  await writeAuditLog({ actorUserId: admin.userId, action: 'setting.delete', target: key });
  return jsonOk({ deleted: true });
});