// SHOPORA — /api/admin/settings
//   GET — all platform settings (key/value)
//   PUT — upsert a setting by key ({ key, value, description? })
//   /api/admin/settings/[key] DELETE — remove a setting

import { NextRequest } from 'next/server';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { withAdminHandler } from '@/lib/admin';
import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { validateRequired } from '@/lib/validate';
import { writeAuditLog } from '@/lib/audit';

export const GET = withAdminHandler('platform.settings.manage', async () => {
  const rows = await prisma.platformSetting.findMany({ orderBy: { key: 'asc' } });
  return jsonOk({
    settings: rows.map((s) => ({ key: s.key, value: s.value, description: s.description, updatedAt: s.updatedAt })),
  });
});

export const PUT = withAdminHandler('platform.settings.manage', async (request: NextRequest) => {
  const admin = requireAuth();
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : '';
  if (validateRequired(key, 'Key')) return jsonError('Key is required', 422);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(key)) return jsonError('Key must be lowercase letters/digits/_/./-, max 64 chars', 422);
  if (!('value' in body)) return jsonError('value is required', 422);

  const setting = await prisma.platformSetting.upsert({
    where: { key },
    update: {
      value: body.value as Prisma.InputJsonValue,
      description: body.description === undefined ? undefined : (body.description === null ? null : String(body.description)),
      updatedById: admin.userId,
    },
    create: {
      key,
      value: body.value as Prisma.InputJsonValue,
      description: body.description === undefined || body.description === null ? null : String(body.description),
      updatedById: admin.userId,
    },
  });
  await writeAuditLog({
    actorUserId: admin.userId,
    action: 'setting.upsert',
    target: key,
    metadata: { value: body.value },
  });
  return jsonOk({ key: setting.key, value: setting.value, description: setting.description });
});