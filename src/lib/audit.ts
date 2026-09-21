// SHOPORA platform audit log (Phase 10) — every privileged action writes a row
// here: impersonation start/end, business suspend/reactivate, plan changes,
// platform admin account changes. Impersonation REQUIRES this (every start/end
// persists an AuditLog so there's always a trail of who viewed what).

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type AuditLogInput = {
  actorUserId?: string | null;
  businessId?: string | null;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** Create an AuditLog row. Never throws — audit failures must not crash the
 * action itself. */
export async function writeAuditLog(input: AuditLogInput): Promise<string | null> {
  try {
    const row = await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        businessId: input.businessId ?? null,
        action: input.action,
        target: input.target ?? null,
        metadataJson: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch {
    return null;
  }
}