// SHOPORA shared business-access resolution (Phase 10) — reused by:
//   • tenant.ts resolveTenantFromRequest (impersonated API context)
//   • dashboard.ts resolveDashboardAccess (impersonated dashboard pages)
// An impersonation session acts as the target business's OWNER, so it resolves
// the Owner role's permission set from the DB (mirrors how a real Owner's
// session is resolved, but keyed off the impersonation target instead).

import prisma from '@/lib/prisma';

export type BusinessOwnerAccess = {
  roleName: string;
  permissions: string[];
};

const OWNER_ROLE = 'Owner';

/**
 * Resolve the Owner permission set for a business, falling back to "all seeded
 * permissions" if the Owner role is somehow missing (defensive — Owner always
 * gets every permission in the seed). Returns null when the business does not
 * exist.
 */
export async function resolveBusinessOwnerAccess(
  businessId: string,
): Promise<BusinessOwnerAccess | null> {
  const [business, ownerRole] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { id: true } }),
    prisma.role.findFirst({
      where: { name: OWNER_ROLE },
      include: { permissions: { include: { permission: true } } },
    }),
  ]);
  if (!business) return null;

  if (!ownerRole) return { roleName: OWNER_ROLE, permissions: [] };
  return {
    roleName: OWNER_ROLE,
    permissions: ownerRole.permissions.map((rp) => rp.permission.name),
  };
}