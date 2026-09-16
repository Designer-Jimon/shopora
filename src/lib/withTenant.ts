// SHOPORA route-handler wrappers for tenant context.
// Two wrappers:
//   withTenant  — optional auth: attaches context if session present, public otherwise
//   requireAuth — rejects 401 if no valid session

import { NextRequest, NextResponse } from 'next/server';
import {
  AuthRequiredError,
  ForbiddenError,
  getTenantContext,
  resolveTenantFromRequest,
  runWithTenant,
} from '@/lib/tenant';
import { authErrors, jsonError } from '@/lib/http';

type RouteHandler = (
  request: NextRequest,
  context?: unknown,
) => Promise<NextResponse> | NextResponse;

function handleError(err: unknown): NextResponse {
  if (err instanceof AuthRequiredError) return authErrors.unauthorized();
  if (err instanceof ForbiddenError) return authErrors.forbidden();
  throw err; // re-throw unexpected errors
}

/**
 * Wraps a route handler in tenant context (optional auth).
 * If a valid session is present the context is populated; otherwise the
 * handler still runs but `getTenantContext()` returns authenticated=false.
 *
 * Usage:
 *   export const GET = withTenant(async (request) => { ... });
 */
export function withTenant(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const existing = getTenantContext();
    if (existing) {
      try { return await handler(request, context); }
      catch (err) { return handleError(err); }
    }

    const tenantContext = await resolveTenantFromRequest(request);
    return runWithTenant(tenantContext, async () => {
      try { return await handler(request, context); }
      catch (err) { return handleError(err); }
    });
  };
}

/**
 * Wraps a route handler that requires an authenticated session.
 * Returns 401 if no valid session, 403 if permission check fails (via
 * requireAuth/requirePermission in the handler body).
 *
 * Usage:
 *   export const GET = requireAuth(async (request) => { ... });
 */
export function requireAuthHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const existing = getTenantContext();
    if (existing?.authenticated) {
      try { return await handler(request, context); }
      catch (err) { return handleError(err); }
    }

    const tenantContext = await resolveTenantFromRequest(request);
    if (!tenantContext.authenticated) {
      return authErrors.unauthorized();
    }

    return runWithTenant(tenantContext, async () => {
      try { return await handler(request, context); }
      catch (err) { return handleError(err); }
    });
  };
}
