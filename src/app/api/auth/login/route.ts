// SHOPORA — POST /api/auth/login
// Validates credentials, issues access + refresh tokens in HttpOnly cookies.
// Redirect priority is platform > business: an active PlatformStaff membership
// yields role `platform_admin` (the client routes to /admin). Otherwise, for
// business users, the first active BusinessStaff row supplies that businessId.
// If the user belongs to multiple businesses, the first active membership is
// used (multi-business switching arrives later).

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { validateEmail } from '@/lib/validate';
import { verifyPassword } from '@/lib/auth/password';
import { setSessionCookies, issueTokenPair } from '@/lib/auth/session';
import type { PlatformRole } from '@/lib/auth/jwt';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const { email, password } = body;

  const emailErr = validateEmail(email);
  if (emailErr) return authErrors.badRequest(emailErr);
  if (!password || typeof password !== 'string') return authErrors.badRequest('Password is required');

  // ── Find user ─────────────────────────────────────────────────────
  const normalizedEmail = (email as string).trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.isActive) {
    return authErrors.badRequest('Invalid email or password');
  }

  // ── Verify password ───────────────────────────────────────────────
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    return authErrors.badRequest('Invalid email or password');
  }

  // ── Resolve role membership (redirect priority: platform > business) ─────
  // An active PlatformStaff row is resolved FIRST and makes this a platform
  // session (role: platform_admin, no businessId claim). The business branch
  // only applies to users with NO platform membership, so a Super Admin who
  // also owns a business still lands on /admin after login.
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

  const { accessToken, refreshToken } = await issueTokenPair(user.id, {
    role: platformRole,
    businessId: staffMembership?.businessId,
    businessRole: staffMembership?.role.name,
    permissions: platformMembership
      ? platformMembership.role.permissions.map((rp) => rp.permission.name)
      : staffMembership
        ? staffMembership.role.permissions.map((rp) => rp.permission.name)
        : [],
  });

  // ── Update lastLoginAt ────────────────────────────────────────────
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const ACCESS_MAX  = 60 * 15;
  const REFRESH_MAX = 60 * 60 * 24 * 30;

  const response = jsonOk({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    role: platformRole,
    businessId: staffMembership?.businessId ?? null,
    businessRole: staffMembership?.role.name ?? null,
  });

  return setSessionCookies(response, accessToken, refreshToken, ACCESS_MAX, REFRESH_MAX);
}
