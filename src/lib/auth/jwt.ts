// SHOPORA auth JWT — sign/verify via jose (edge-compatible, no Node-only deps).
// Uses HS256 for simplicity and edge compatibility. A future upgrade can swap
// to ES256 or RS256 if asymmetric verification is needed for edge middleware.

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const ALG = 'HS256' as const;

// ------------------------------------------------------------------
// Claims
// ------------------------------------------------------------------

export type PlatformRole = 'platform_admin' | 'business_user' | 'customer';

export type AccessTokenClaims = JWTPayload & {
  sub: string;                // userId
  role: PlatformRole;
  businessId?: string;        // present when role = business_user
  businessRole?: string;      // role name in the business (Owner / Staff)
  permissions: string[];      // resolved from role_permissions for this business
  typ: 'access';
};

export type RefreshTokenClaims = JWTPayload & {
  sub: string;
  typ: 'refresh';
};

// ------------------------------------------------------------------
// Key derivation (HS256 requires a symmetric secret)
// ------------------------------------------------------------------

function getKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

// ------------------------------------------------------------------
// Sign / Verify
// ------------------------------------------------------------------

export async function signAccessToken(
  payload: Omit<AccessTokenClaims, 'iat' | 'exp' | 'iss' | 'typ'>,
  opts: { secret: string; expiresIn: string },
): Promise<string> {
  return new SignJWT({ ...payload, typ: 'access' as const })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer('shopora')
    .setExpirationTime(opts.expiresIn)
    .sign(getKey(opts.secret));
}

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret), {
      issuer: 'shopora',
    });
    if (payload.typ !== 'access') return null;
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

export async function signRefreshToken(
  userId: string,
  opts: { secret: string; expiresIn: string },
): Promise<string> {
  return new SignJWT({ sub: userId, typ: 'refresh' })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setIssuer('shopora')
    .setExpirationTime(opts.expiresIn)
    .sign(getKey(opts.secret));
}

export async function verifyRefreshToken(
  token: string,
  secret: string,
): Promise<RefreshTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret), {
      issuer: 'shopora',
    });
    if (payload.typ !== 'refresh') return null;
    return payload as unknown as RefreshTokenClaims;
  } catch {
    return null;
  }
}
