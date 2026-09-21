// SHOPORA route-handler wrappers for tenant context.
//   withTenant  — optional auth: attaches context if session present, public otherwise
//   requireAuth — rejects 401 if no valid session

import { NextRequest, NextResponse } from 'next/server';
import {
  AuthRequiredError,
  ForbiddenError,
  getTenantContext,
  resolveTenantFromRequest,
  runWithTenant,
  type TenantContext,
} from '@/lib/tenant';
import { authErrors, jsonError } from '@/lib/http';
import { getSubscriptionState } from '@/lib/subscriptions/state';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';

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
 * Phase 9 write gate: a cancelled subscription freezes the dashboard to
 * read-only (the Subscription page itself is exempt so the owner can renew).
 * Read-only requests pass through untouched.
 */
async function enforceSubscriptionWriteGate(
  request: NextRequest,
  ctx: TenantContext,
): Promise<NextResponse | null> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return null;
  if (!ctx.businessId) return null;
  if (request.nextUrl.pathname.startsWith('/api/subscription')) return null;

  const state = await getSubscriptionState(ctx.businessId);
  if (state.status === SUBSCRIPTION_STATUSES.cancelled) {
    return jsonError('Your subscription has been cancelled — renew to resume operations', 423);
  }
  return null;
}

/**
 * Phase 10 impersonation guard — while a platform admin is impersonating a
 * business, mutating requests to the business's SECURITY / PAYMENT-KEY surfaces
 * are blocked (403). This is the enforcement the "impersonation flag on the
 * session" requirement demands; the banner + UI hide these anyway, but the API
 * is the real boundary.
 */
const IMPERSONATION_SENSITIVE_ROUTES: { match: (p: string) => boolean; methods: string[] }[] = [
  // Business settings / security surface (Store Settings, appearance, etc.)
  { match: (p) => p === '/api/businesses/me', methods: ['POST', 'PUT', 'PATCH', 'DELETE'] },
  // Payment provider secrets (connect/update/disconnect)
  { match: (p) => p.startsWith('/api/payments/providers'), methods: ['PUT', 'DELETE'] },
];

async function enforceImpersonationSensitiveGuard(
  request: NextRequest,
  ctx: TenantContext,
): Promise<NextResponse | null> {
  if (!ctx.impersonatedBy) return null;
  const method = request.method;
  const path = request.nextUrl.pathname;
  for (const rule of IMPERSONATION_SENSITIVE_ROUTES) {
    if (rule.methods.includes(method) && rule.match(path)) {
      return jsonError('Not available in an impersonated platform session', 403);
    }
  }
  return null;
}

/**
 * Wraps a route handler in tenant context (optional auth).
 * If a valid session is present the context is populated; otherwise the
 * handler still runs but `getTenantContext()` returns authenticated=false.
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
 * Returns 401 if no valid session. Mutating methods additionally run the
 * Phase 9 subscription write-gate (423 when the subscription is cancelled).
 */
export function requireAuthHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    const existing = getTenantContext();
    const ctx: TenantContext | undefined = existing?.authenticated ? existing : undefined;

    if (!ctx) {
      const tenantContext = await resolveTenantFromRequest(request);
      if (!tenantContext.authenticated) {
        return authErrors.unauthorized();
      }
      return runWithTenant(tenantContext, async () => {
        try {
          const blocked = await enforceSubscriptionWriteGate(request, tenantContext);
          if (blocked) return blocked;
          const sensitive = await enforceImpersonationSensitiveGuard(request, tenantContext);
          if (sensitive) return sensitive;
          return await handler(request, context);
        } catch (err) { return handleError(err); }
      });
    }

    try {
      const blocked = await enforceSubscriptionWriteGate(request, ctx);
      if (blocked) return blocked;
      const sensitive = await enforceImpersonationSensitiveGuard(request, ctx);
      if (sensitive) return sensitive;
      return await handler(request, context);
    } catch (err) { return handleError(err); }
  };
}