// SHOPORA session helpers — HttpOnly cookie management and session resolution.
// Interim: stateless JWT. A later phase replaces this with a Redis-backed
// session store for instant revocation.

import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import {
  type AccessTokenClaims,
  type PlatformRole,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt';

// ------------------------------------------------------------------
// Cookie config
// ------------------------------------------------------------------

export const COOKIE_ACCESS  = 'shopora_session';
export const COOKIE_REFRESH = 'shopora_refresh';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/** Set both access + refresh cookies on a NextResponse. */
export function setSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  accessMaxAge: number,
  refreshMaxAge: number,
): NextResponse {
  res.cookies.set(COOKIE_ACCESS, accessToken, {
    ...COOKIE_OPTS,
    maxAge: accessMaxAge,
  });
  res.cookies.set(COOKIE_REFRESH, refreshToken, {
    ...COOKIE_OPTS,
    maxAge: refreshMaxAge,
  });
  return res;
}

/** Clear both session cookies. */
export function clearSessionCookies(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_ACCESS, '', { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set(COOKIE_REFRESH, '', { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}

/** Read the access token raw string from cookies on an incoming request. */
export function readAccessTokenRaw(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_ACCESS)?.value;
}

/** Read the refresh token raw string from cookies. */
export function readRefreshTokenRaw(request: NextRequest): string | undefined {
  return request.cookies.get(COOKIE_REFRESH)?.value;
}

// ------------------------------------------------------------------
// Token pair helpers
// ------------------------------------------------------------------

const ACCESS_TTL_SECONDS  = 60 * 15;         // 15 minutes
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function issueTokenPair(
  userId: string,
  claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'sub' | 'typ'>,
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ ...claims, sub: userId }, {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: `${ACCESS_TTL_SECONDS}s`,
    }),
    signRefreshToken(userId, {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: `${REFRESH_TTL_SECONDS}s`,
    }),
  ]);
  return { accessToken, refreshToken };
}

// ------------------------------------------------------------------
// Request-level session resolution (used by tenant.ts / withTenant.ts)
// ------------------------------------------------------------------

export type SessionResult = {
  authenticated: true;
  userId: string;
  role: PlatformRole;
  businessId?: string;
  businessRole?: string;
  permissions: string[];
  /** platform.admin — present when role = platform_admin (Phase 10). */
  platformStaffId?: string;
  platformRoleName?: string;
} | {
  authenticated: false;
};

/**
 * Resolve session from an incoming request.
 *
 * 1. Verify the access token (fast, no DB).
 * 2. DB-verifies the user is still active + (for business users) the
 *    BusinessStaff row is still active + refreshes permissions from DB.
 *    This gives near-instant revocation without Redis.
 */
export async function resolveSession(
  request: NextRequest,
): Promise<SessionResult> {
  const raw = readAccessTokenRaw(request);
  if (!raw) return { authenticated: false };

  const claims = await verifyAccessToken(raw, process.env.JWT_ACCESS_SECRET!);
  if (!claims || !claims.sub) return { authenticated: false };

  // Lazy import to avoid circular deps and keep Prisma loading on demand.
  const { default: db } = await import('@/lib/prisma');

  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.isActive) return { authenticated: false };

  // ── Redirect priority (Phase 10): platform membership > business ─────────
  // GLOBAL platform membership is resolved from the DB row (source of truth,
  // not the JWT claim), so roles/permissions revoke near-instantly. An active
  // PlatformStaff row makes this a PLATFORM session, even for a user who also
  // owns or staffs a business — a Super Admin lands in /admin, never silently
  // in a business dashboard. The business branch below is only reached when the
  // user has NO platform membership.
  const platform = await db.platformStaff.findFirst({
    where: { userId: user.id, isActive: true },
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  });

  if (platform) {
    return {
      authenticated: true,
      userId: user.id,
      role: 'platform_admin',
      platformStaffId: platform.id,
      platformRoleName: platform.role.name,
      permissions: platform.role.permissions.map((rp) => rp.permission.name),
    };
  }

  if (claims.role === 'business_user' && claims.businessId) {
    const staff = await db.businessStaff.findFirst({
      where: {
        userId: user.id,
        businessId: claims.businessId,
        isActive: true,
      },
      include: {
        role: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });

    if (!staff) return { authenticated: false };

    return {
      authenticated: true,
      userId: user.id,
      role: 'business_user',
      businessId: staff.businessId,
      businessRole: staff.role.name,
      permissions: staff.role.permissions.map((rp) => rp.permission.name),
    };
  }

  return {
    authenticated: true,
    userId: user.id,
    role: claims.role,
    permissions: [],
  };
}
