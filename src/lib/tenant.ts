// SHOPORA tenant context — per-request multi-tenancy via AsyncLocalStorage.
// Phase 2: resolveTenantFromRequest now performs real JWT verification
// + DB-verifies active membership on every request, giving near-instant
// revocation without Redis.

import { AsyncLocalStorage } from 'node:async_hooks';
import { type NextRequest } from 'next/server';
import { type PlatformRole } from '@/lib/auth/jwt';
import { resolveSession, type SessionResult } from '@/lib/auth/session';
import { readImpersonationFromRequest } from '@/lib/impersonation';
import { resolveBusinessOwnerAccess } from '@/lib/businessAccess';

// ------------------------------------------------------------------
// Context type
// ------------------------------------------------------------------

export type TenantContext = {
  authenticated: boolean;
  userId?: string;
  role?: PlatformRole;
  businessId?: string;
  businessRole?: string;
  permissions: string[];
  /** platform.admin (Phase 10) — set when the session is platform staff. */
  platformStaffId?: string;
  platformRoleName?: string;
  /** The platform admin's userId when this business context is an impersonated session. */
  impersonatedBy?: string;
};

// ------------------------------------------------------------------
// AsyncLocalStorage
// ------------------------------------------------------------------

export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Resolve the tenant context from the request. This is now async and performs
 * real JWT verification + DB membership verification.
 */
export async function resolveTenantFromRequest(
  request: NextRequest,
): Promise<TenantContext> {
  const session: SessionResult = await resolveSession(request);

  if (!session.authenticated) {
    return { authenticated: false, permissions: [] };
  }

  // Phase 10 impersonation: an authenticated platform admin holding a valid
  // impersonation cookie sees API routes as the target business's Owner.
  // The token is stateless (exp auto-expires) and its `exp` is re-verified
  // here on every request.
  const impersonation = await readImpersonationFromRequest(request);
  const impersonatedContext = impersonation
    ? await resolveBusinessOwnerAccess(impersonation.businessId)
    : null;
  if (impersonation && impersonatedContext) {
    return {
      authenticated: true,
      userId: session.userId,
      role: 'business_user',
      businessId: impersonation.businessId,
      businessRole: impersonatedContext.roleName,
      permissions: impersonatedContext.permissions,
      impersonatedBy: impersonation.adminUserId,
    };
  }

  return {
    authenticated: true,
    userId: session.userId,
    role: session.role,
    businessId: session.businessId,
    businessRole: session.businessRole,
    permissions: session.permissions,
    platformStaffId: session.platformStaffId,
    platformRoleName: session.platformRoleName,
  };
}

/**
 * Run `fn` inside the tenant context for this request.
 */
export async function runWithTenant<T>(
  context: TenantContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return tenantContextStorage.run(context, fn);
}

/** Convenience: get context or throw if not authenticated. */
export function requireAuth(): TenantContext {
  const ctx = getTenantContext();
  if (!ctx?.authenticated) {
    throw new AuthRequiredError();
  }
  return ctx;
}

/** Convenience: get context or throw if lacking a specific permission. */
export function requirePermission(permission: string): TenantContext {
  const ctx = requireAuth();
  if (!ctx.permissions.includes(permission)) {
    throw new ForbiddenError(permission);
  }
  return ctx;
}

// ------------------------------------------------------------------
// Typed errors for route handlers to catch
// ------------------------------------------------------------------

export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export class ForbiddenError extends Error {
  public permission: string;
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}
