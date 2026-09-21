// SHOPORA dashboard access — resolves the current user's dashboard session and
// enforces the Phase 4 guard: authenticated business_user whose business has
// completed onboarding (onboardingStep === 99).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';
import { isOnboardingComplete } from '@/lib/business';
import {
  readImpersonationFromCookies,
  type ImpersonationClaims,
} from '@/lib/impersonation';
import { resolveBusinessOwnerAccess } from '@/lib/businessAccess';

export type DashboardAccess = {
  userId: string;
  firstName: string;
  lastName: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessRole: string;
  permissions: string[];
  /** The platform admin's userId when this is an impersonated session (Phase 10). */
  impersonatedBy?: string;
};

export type DashboardAccessResult =
  | { ok: true; access: DashboardAccess }
  | { ok: false; redirectTo: string };

/**
 * Verify the request session against the Phase 4 dashboard guard and load the
 * user's business + role + current permission set from the DB (not just the
 * JWT claims, so a freshly-registered owner sees their real permissions and a
 * suspended user is rejected even before the page renders).
 */
export async function resolveDashboardAccess(): Promise<DashboardAccessResult> {
  const token = (await cookies()).get('shopora_session')?.value;
  if (!token) return { ok: false, redirectTo: '/login' };

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return { ok: false, redirectTo: '/login' };

  const claims = await verifyAccessToken(token, secret);
  if (!claims || !claims.sub) return { ok: false, redirectTo: '/login' };

  // Phase 10 impersonation — a valid, unexpired impersonation cookie takes
  // priority: render the TARGET business's dashboard as its Owner, with a
  // banner controlled by DashboardAccess.impersonatedBy. The admin's platform
  // permission is re-verified against the DB (near-instant revocation).
  const impersonation = await readImpersonationFromCookies();
  if (impersonation) {
    const impersonated = await resolveImpersonatedAccess(impersonation);
    if (impersonated) return { ok: true, access: impersonated };
    return { ok: false, redirectTo: '/admin' };
  }

  // Redirect priority: platform membership outranks business membership.
  // An active PlatformStaff row means this user belongs on /admin first, not
  // the business dashboard — same rule as resolveSession (DB is source of
  // truth, not the JWT claim). Without this, a stale business_user JWT from
  // a dual-account login (now fixed to issue platform_admin) could still slip
  // past this guard while the token is live.
  const platformCheck = await prisma.platformStaff.findFirst({
    where: { userId: claims.sub, isActive: true },
    select: { id: true },
  });
  if (platformCheck) return { ok: false, redirectTo: '/admin' };

  if (claims.role !== 'business_user' || !claims.businessId) {
    // Customer / platform users have no dashboard — send them away entirely.
    return { ok: false, redirectTo: '/' };
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { firstName: true, lastName: true, isActive: true },
  });
  if (!user || !user.isActive) return { ok: false, redirectTo: '/login' };

  const staff = await prisma.businessStaff.findFirst({
    where: { userId: claims.sub, businessId: claims.businessId, isActive: true },
    select: {
      role: {
        select: {
          name: true,
          permissions: { select: { permission: { select: { name: true } } } },
        },
      },
      business: {
        select: { name: true, slug: true, onboardingStep: true },
      },
    },
  });

  if (!staff) return { ok: false, redirectTo: '/login' };

  const business = staff.business;
  if (!isOnboardingComplete(business.onboardingStep)) {
    return { ok: false, redirectTo: '/setup' };
  }

  return {
    ok: true,
    access: {
      userId: claims.sub,
      firstName: user.firstName,
      lastName: user.lastName,
      businessId: claims.businessId,
      businessName: business.name,
      businessSlug: business.slug,
      businessRole: staff.role.name,
      permissions: staff.role.permissions.map((rp) => rp.permission.name),
    },
  };
}

/** Resolve dashboard access and redirect on failure (server components). */
export async function requireDashboardAccess(): Promise<DashboardAccess> {
  const result = await resolveDashboardAccess();
  if (!result.ok) redirect(result.redirectTo);
  return result.access;
}

/**
 * Build dashboard access for an impersonated platform session. Verifies the
 * admin still actively holds `platform.impersonate`, then resolves the target
 * business as its Owner. Returns null when anything is invalid (→ redirect to
 * /admin so the admin isn't trapped in a broken state).
 */
async function resolveImpersonatedAccess(
  imp: ImpersonationClaims,
): Promise<DashboardAccess | null> {
  const [admin, ownerAccess] = await Promise.all([
    prisma.platformStaff.findFirst({
      where: {
        userId: imp.adminUserId,
        isActive: true,
        role: {
          permissions: { some: { permission: { name: 'platform.impersonate' } } },
        },
      },
      select: {
        user: { select: { firstName: true, lastName: true, isActive: true } },
      },
    }),
    resolveBusinessOwnerAccess(imp.businessId),
  ]);

  if (!admin || !admin.user.isActive || !ownerAccess) return null;

  const business = await prisma.business.findUnique({
    where: { id: imp.businessId },
    select: { name: true, slug: true, onboardingStep: true },
  });
  if (!business) return null;

  return {
    userId: imp.adminUserId,
    firstName: admin.user.firstName,
    lastName: admin.user.lastName,
    businessId: imp.businessId,
    businessName: business.name,
    businessSlug: business.slug,
    businessRole: ownerAccess.roleName,
    permissions: ownerAccess.permissions,
    impersonatedBy: imp.adminUserId,
  };
}