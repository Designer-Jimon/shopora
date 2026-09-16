import { NextRequest, NextResponse } from 'next/server';
import { withTenant } from '@/lib/withTenant';
import { getTenantContext } from '@/lib/tenant';

/**
 * Health check — verifies the API is up and the tenant-context wrapper is
 * wired. Now returns real auth info when a valid session is present.
 */
export const GET = withTenant(async (_request: NextRequest) => {
  const tenant = getTenantContext();

  return NextResponse.json({
    status: 'ok',
    service: 'shopora-api',
    authenticated: tenant?.authenticated ?? false,
    userId: tenant?.userId ?? null,
    role: tenant?.role ?? null,
    businessId: tenant?.businessId ?? null,
    businessRole: tenant?.businessRole ?? null,
    permissions: tenant?.permissions ?? [],
    timestamp: new Date().toISOString(),
  });
});
