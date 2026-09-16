// SHOPORA dashboard access — resolves the current user's dashboard session and
// enforces the Phase 4 guard: authenticated business_user whose business has
// completed onboarding (onboardingStep === 99).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';
import { isOnboardingComplete } from '@/lib/business';

export type DashboardAccess = {
  userId: string;
  firstName: string;
  lastName: string;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessRole: string;
  permissions: string[];
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