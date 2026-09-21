// SHOPORA merchant impersonation ("log in as this business") — Phase 10.
//
// A Super Admin holding `platform.impersonate` can start a time-limited,
// explicitly-scoped session as a business's Owner. Mechanic:
//
//   POST /api/admin/impersonate { businessId }  → sets `shopora_impersonation`
//   cookie (signed JWT, typ='impersonation', sub=adminUserId, businessId,
//   exp = now + IMPERSONATION_TTL_MINUTES, default 30).
//
// While the cookie is valid:
//   • Every dashboard page renders under that business with Owner-style access
//     and a persistent banner (via src/lib/dashboard.ts + the layout).
//   • Business API routes see the business's tenant context (same as an Owner
//     session) — set in src/lib/tenant.ts resolveTenantFromRequest.
//   • Sensitive routes (security/settings writes, payment provider keys) 423.
//
// Every start/end writes an AuditLog row; auto-expiry is enforced by the JWT
// `exp`, which dashboard/api resolution re-verifies on every request.

import { SignJWT, jwtVerify } from 'jose';
import { type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { type TenantContext } from '@/lib/tenant';

export const IMPERSONATION_COOKIE = 'shopora_impersonation';

export function impersonationTTLMinutes(): number {
  const raw = parseInt(process.env.IMPERSONATION_TTL_MINUTES ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

export type ImpersonationClaims = {
  adminUserId: string;
  businessId: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_ACCESS_SECRET ?? '');
}

/** Sign a fresh impersonation token (stateless; exp enforces auto-expiry). */
export async function signImpersonationToken(
  adminUserId: string,
  businessId: string,
): Promise<string> {
  const ttl = impersonationTTLMinutes();
  return new SignJWT({ businessId, typ: 'impersonation' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminUserId)
    .setIssuer('shopora')
    .setIssuedAt()
    .setExpirationTime(`${ttl}m`)
    .sign(secretKey());
}

/** Verify an impersonation token. Returns claims or null (expired → null). */
export async function verifyImpersonationToken(
  token: string,
): Promise<ImpersonationClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'shopora' });
    if (payload.typ !== 'impersonation' || !payload.sub || !payload.businessId) return null;
    return { adminUserId: payload.sub, businessId: String(payload.businessId) };
  } catch {
    return null;
  }
}

/** Read + verify the impersonation cookie from a route handler request. */
export async function readImpersonationFromRequest(
  request: NextRequest,
): Promise<ImpersonationClaims | null> {
  const raw = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  return verifyImpersonationToken(raw);
}

/** Read + verify the impersonation cookie in a server component. */
export async function readImpersonationFromCookies(): Promise<ImpersonationClaims | null> {
  const raw = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  return verifyImpersonationToken(raw);
}

/** True when this tenant context is an impersonated session (Phase 10). */
export function isImpersonatedContext(ctx: TenantContext): boolean {
  return Boolean(ctx.impersonatedBy);
}