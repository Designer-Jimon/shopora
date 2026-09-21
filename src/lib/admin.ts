// SHOPORA platform admin access (Phase 10) — the Super Admin route group
// (`/admin/...`). SEPARATE from the business dashboard: platform access is
// resolved from the global PlatformStaff membership + the platform Role's
// permission set (Phase 2 RBAC), and is the same regardless of any business
// the user might also belong to.
//
//   resolveAdminAccess / requireAdminAccess — server components (layout/pages)
//   withAdminHandler(permission)           — API routes (DB is the source of
//                                             truth, not the JWT claim)

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import { resolveSession } from '@/lib/auth/session';
import prisma from '@/lib/prisma';
import { runWithTenant } from '@/lib/tenant';
import { authErrors } from '@/lib/http';

export type AdminAccess = {
  userId: string;
  firstName: string;
  lastName: string;
  roleName: string;
  platformStaffId: string;
  permissions: string[];
};

export type AdminAccessResult =
  | { ok: true; access: AdminAccess }
  | { ok: false; redirectTo: string };

type AdminHandler = (
  request: NextRequest,
  context: { params?: Record<string, string | string[]> },
  access: AdminAccess,
) => Promise<NextResponse> | NextResponse;

/**
 * Resolve platform-admin access for server components. Verifies the session
 * JWT, then loads the active PlatformStaff membership + role permissions from
 * the DB (same near-instant revocation pattern as dashboard.ts). The base
 * `platform.access` permission gates the whole /admin group.
 */
export async function resolveAdminAccess(): Promise<AdminAccessResult> {
  const token = (await cookies()).get('shopora_session')?.value;
  if (!token) return { ok: false, redirectTo: '/login' };

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return { ok: false, redirectTo: '/login' };

  const claims = await verifyAccessToken(token, secret);
  if (!claims || !claims.sub) return { ok: false, redirectTo: '/login' };

  const staff = await prisma.platformStaff.findFirst({
    where: { userId: claims.sub, isActive: true },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      user: { select: { firstName: true, lastName: true, isActive: true } },
    },
  });
  if (!staff || !staff.user.isActive) return { ok: false, redirectTo: '/' };

  const permissions = staff.role.permissions.map((rp) => rp.permission.name);
  if (!permissions.includes('platform.access')) return { ok: false, redirectTo: '/' };

  return {
    ok: true,
    access: {
      userId: claims.sub,
      firstName: staff.user.firstName,
      lastName: staff.user.lastName,
      roleName: staff.role.name,
      platformStaffId: staff.id,
      permissions,
    },
  };
}

/** Resolve admin access, redirect on failure (server components). */
export async function requireAdminAccess(): Promise<AdminAccess> {
  const result = await resolveAdminAccess();
  if (!result.ok) redirect(result.redirectTo);
  return result.access;
}

/**
 * API-route wrapper for /admin. Resolves the session DIRECTLY (never through
 * the tenanted `resolveTenantFromRequest`, which would apply an impersonation
 * cookie) so an impersonation cookie cannot widen admin API access — a pure
 * platform-admin check. Requires an active PlatformStaff row holding
 * `permission` (defaults to `platform.access`).
 */
export function withAdminHandler(
  permission: string,
  handler: AdminHandler,
): (request: NextRequest, context: { params?: Record<string, string | string[]> }) => Promise<NextResponse> {
  return async (request, context) => {
    const session = await resolveSession(request);
    if (!session.authenticated) return authErrors.unauthorized();
    if (session.role !== 'platform_admin' || !session.platformStaffId || !session.platformRoleName) {
      return authErrors.forbidden();
    }
    if (!session.permissions.includes(permission)) return authErrors.forbidden();

    const access: AdminAccess = {
      userId: session.userId,
      firstName: '',
      lastName: '',
      roleName: session.platformRoleName,
      platformStaffId: session.platformStaffId,
      permissions: session.permissions,
    };

    return runWithTenant(
      {
        authenticated: true,
        userId: session.userId,
        role: 'platform_admin',
        platformStaffId: session.platformStaffId,
        platformRoleName: session.platformRoleName,
        permissions: session.permissions,
      },
      () => handler(request, context, access),
    );
  };
}