// SHOPORA — /api/subscription/return
//   GET — Paystack bounces the owner here after the hosted subscription
//   checkout. We VERIFY server-side (never trust the redirect) and activate the
//   subscription on success, then redirect the owner back to the Subscription
//   page with a status query param.

import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/http';
import prisma from '@/lib/prisma';
import {
  applySubscriptionPaymentSuccess,
  verifySubscriptionTransaction,
} from '@/lib/payments/subscription';
import { resolveSession } from '@/lib/auth/session';

export const GET = async (request: NextRequest): Promise<Response> => {
  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference) return jsonError('Missing reference', 400);

  const session = await resolveSession(request);
  if (!session.authenticated || !session.businessId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl.origin));
  }

  const txn = await prisma.transaction.findFirst({
    where: { businessId: session.businessId, provider: 'paystack', providerRef: reference },
    select: { id: true, type: true },
  });
  if (!txn || txn.type !== 'subscription') {
    return NextResponse.redirect(new URL('/subscription?status=failed', request.nextUrl.origin));
  }

  const verify = await verifySubscriptionTransaction(reference);
  if (verify.status === 'success') {
    const data = await verifyResultData(reference);
    await applySubscriptionPaymentSuccess({
      businessId: session.businessId,
      providerRef: reference,
      amount: verify.amountPaid ?? 0,
      authorizationCode: data?.authorizationCode ?? null,
      customerCode: data?.customerCode ?? null,
    });
    return NextResponse.redirect(new URL('/subscription?status=paid', request.nextUrl.origin));
  }

  return NextResponse.redirect(new URL('/subscription?status=failed', request.nextUrl.origin));
};

// Paystack's verify endpoint response includes the authorization + customer;
// the provider abstraction strips it, so re-read directly here.
async function verifyResultData(reference: string): Promise<{ authorizationCode: string | null; customerCode: string | null } | null> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return null;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { authorization?: { authorization_code?: string }; customer?: { customer_code?: string } };
    } | null;
    return {
      authorizationCode: json?.data?.authorization?.authorization_code ?? null,
      customerCode: json?.data?.customer?.customer_code ?? null,
    };
  } catch {
    return null;
  }
}