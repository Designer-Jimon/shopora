// SHOPORA — POST /api/auth/refresh
// Reads the refresh token cookie, verifies it, re-issues both tokens.
// User must still be active and (for business users) membership still active.
// Sliding window: both tokens get fresh expiry.

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authErrors } from '@/lib/http';
import {
  readRefreshTokenRaw,
  issueTokenPair,
  setSessionCookies,
} from '@/lib/auth/session';
import { verifyRefreshToken } from '@/lib/auth/jwt';
import type { PlatformRole } from '@/lib/auth/jwt';

export async function POST(request: NextRequest) {
  const raw = readRefreshTokenRaw(request);
  if (!raw) return authErrors.badRequest('No refresh token');

  const claims = await verifyRefreshToken(raw, process.env.JWT_REFRESH_SECRET!);
  if (!claims || !claims.sub) return authErrors.badRequest('Invalid refresh token');

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.isActive) return authErrors.badRequest('Invalid refresh token');

  // Resolve role membership (redirect priority: platform > business) — same
  // rule as POST /api/auth/login: an active PlatformStaff row resolves first
  // and issues a platform session; business membership only applies to users
  // with NO platform membership.
  const platformMembership = await prisma.platformStaff.findFirst({
    where: { userId: user.id, isActive: true },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  const staffMembership = platformMembership
    ? null
    : await prisma.businessStaff.findFirst({
        where: { userId: user.id, isActive: true },
        include: {
          role: {
            include: { permissions: { include: { permission: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

  const platformRole: PlatformRole = platformMembership
    ? 'platform_admin'
    : staffMembership
      ? 'business_user'
      : 'customer';

  const { accessToken, refreshToken: newRefresh } = await issueTokenPair(user.id, {
    role: platformRole,
    businessId: staffMembership?.businessId,
    businessRole: staffMembership?.role.name,
    permissions: platformMembership
      ? platformMembership.role.permissions.map((rp) => rp.permission.name)
      : staffMembership
        ? staffMembership.role.permissions.map((rp) => rp.permission.name)
        : [],
  });

  const ACCESS_MAX  = 60 * 15;
  const REFRESH_MAX = 60 * 60 * 24 * 30;

  const { NextResponse } = await import('next/server');
  const emptyResponse = new NextResponse(null, { status: 204 });
  return setSessionCookies(emptyResponse, accessToken, newRefresh, ACCESS_MAX, REFRESH_MAX);
}
