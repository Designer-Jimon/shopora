// SHOPORA — /api/cron/billing
//   GET — token-guarded daily billing sweep: soft-downgrades every overdue
//   trial / lapsed paid / elapsed legacy-grace row onto the Free plan (see
//   src/lib/subscriptions/billing.ts). Guarded by CRON_TOKEN so it is safe to
//   hit from any scheduler (vercel cron, uptime pinger, windows task…).
//   Usage: GET /api/cron/billing?token=<CRON_TOKEN>
//   When CRON_TOKEN is unset the route is inert (404) and the standalone
//   `npm run billing:daily` script can be used instead.

import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/http';
import { runBillingDowngrades } from '@/lib/subscriptions/billing';

export const dynamic = 'force-dynamic';

function timingSafeToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const GET = async (request: NextRequest): Promise<Response> => {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return jsonError('Not found', 404);

  const header = request.headers.get('authorization');
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const provided = request.nextUrl.searchParams.get('token') ?? bearer;
  if (!provided || !timingSafeToken(expected, provided)) {
    return jsonError('Unauthorized', 401);
  }

  const result = await runBillingDowngrades();
  return jsonOk({ run: 'billing.daily', ...result });
};