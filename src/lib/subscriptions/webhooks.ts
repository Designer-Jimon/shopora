// SHOPORA native Paystack subscription webhook handling — Phase 11.
//
// The PLATFORM's Paystack account owns the store's recurring billing, so every
// subscription lifecycle event is HMAC-verified against the platform key (with
// an optional PAYSTACK_WEBHOOK_SECRET fallback) before arriving here. Payloads
// are authentic by construction, which lets us resolve a webhook to a business
// by its native subscription code (authoritative) or the customer's owner
// email (fallback, needed when events arrive before subscription.create links
// the code).
//
// The route layer owns: signature verification, the WebhookEvent idempotency
// ledger, and the existing ORDER-payment path. This module owns everything
// that touches a subscription row.

import prisma from '@/lib/prisma';
import { PaystackProvider } from '@/lib/payments/paystack';
import {
  applyNativeSubscriptionCreate,
  applyNativeRenewalCharge,
  applySubscriptionPaymentSuccess,
  getPlatformPaystackSecret,
  resolvePlanByPaystackCode,
} from '@/lib/payments/subscription';
import { downgradeToFree } from './downgrade';

/** Events that only ever exist on the PLATFORM's subscription account. */
const NATIVE_EVENTS = new Set([
  'subscription.create',
  'subscription.disable',
  'subscription.enable',
  'invoice.create',
  'invoice.payment_failed',
  'invoice.payment_success',
  'subscription.manage_link_sent',
  'subscription.notification',
]);

function obj(o: unknown, key: string): Record<string, unknown> | null {
  if (o && typeof o === 'object' && key in o) {
    const v = (o as Record<string, unknown>)[key];
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  }
  return null;
}

function str(o: unknown, key: string): string | null {
  const v = obj(o, key) ?? (o as Record<string, unknown> | null)?.[key];
  return typeof v === 'string' && v ? v : null;
}

export type NativeWebhookFields = {
  subscriptionCode: string | null;
  planCode: string | null;
  email: string | null;
  customerCode: string | null;
  authorizationCode: string | null;
  amountNaira: number;
};

/** Pull every identifier Paystack may spread across charge / subscription /
 * invoice payloads, working around the different event shapes. */
export function extractNativeFields(data: Record<string, unknown>): NativeWebhookFields {
  const sub = obj(data, 'subscription');
  const customer = obj(data, 'customer') ?? obj(sub, 'customer');
  const plan = obj(data, 'plan') ?? obj(sub, 'plan');
  const amountKobo = Number(data.amount ?? 0);
  return {
    subscriptionCode: str(data, 'subscription_code') ?? str(sub, 'subscription_code'),
    planCode: str(plan, 'plan_code'),
    email: str(customer, 'email'),
    customerCode: str(customer, 'customer_code'),
    authorizationCode: str(obj(data, 'authorization'), 'authorization_code'),
    amountNaira: Number.isFinite(amountKobo) ? amountKobo / 100 : 0,
  };
}

/** True when this event belongs to the platform's native-subscription account
 * (lifecycle events, or charge events carrying a subscription/plan code). */
export function isNativeSubscriptionEvent(event: string, data: Record<string, unknown>): boolean {
  if (NATIVE_EVENTS.has(event)) return true;
  if (event === 'charge.success' || event === 'charge.failed') {
    const f = extractNativeFields(data);
    return Boolean(f.subscriptionCode || f.planCode);
  }
  return false;
}

/** True when the raw body + signature verify against the platform key(s). */
export function verifyPlatformWebhook(rawBody: string, signature: string): boolean {
  const provider = new PaystackProvider(null);
  const candidates = [getPlatformPaystackSecret(), process.env.PAYSTACK_WEBHOOK_SECRET ?? null];
  for (const secret of candidates) {
    if (secret && provider.verifyWebhookSignature(rawBody, signature, secret)) return true;
  }
  return false;
}

/** Resolve the owning business: native subscription code, else owner email. */
export async function resolveBusinessId(
  subscriptionCode: string | null,
  email: string | null,
): Promise<string | null> {
  if (subscriptionCode) {
    const sub = await prisma.subscription.findFirst({
      where: { paystackSubscriptionCode: subscriptionCode },
      select: { businessId: true },
    });
    if (sub) return sub.businessId;
  }
  if (email) {
    const member = await prisma.businessStaff.findFirst({
      where: { user: { email }, role: { name: 'Owner' }, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { businessId: true },
    });
    if (member) return member.businessId;
  }
  return null;
}

type NativeContext = {
  providerRef: string;
  /** Pre-recorded Transaction (initial native charge resolvable by ref). */
  preRecordedTxn?: { businessId: string; type: string | null } | null;
};

/**
 * Apply a native subscription webhook. Returns the outcome label — the route
 * decouples it from HTTP status (unknown references acknowledge instead of
 * bouncing so Paystack stops retrying).
 */
export async function handleNativeWebhook(
  event: string,
  data: Record<string, unknown>,
  ctx: NativeContext,
): Promise<{ handled: string }> {
  const f = extractNativeFields(data);

  switch (event) {
    case 'subscription.create': {
      const plan = await resolvePlanByPaystackCode(f.planCode ?? '');
      if (!plan) return { handled: 'unknown_plan' };
      const businessId = await resolveBusinessId(f.subscriptionCode, f.email);
      if (!businessId) return { handled: 'unresolved' };
      await applyNativeSubscriptionCreate({
        businessId,
        planId: plan.id,
        subscriptionCode: f.subscriptionCode ?? '',
        customerCode: f.customerCode,
      });
      return { handled: 'subscription.create' };
    }

    case 'subscription.disable':
    case 'invoice.payment_failed': {
      const businessId =
        ctx.preRecordedTxn?.businessId ??
        (await resolveBusinessId(f.subscriptionCode, f.email));
      if (!businessId) return { handled: 'unresolved' };
      await downgradeToFree(
        businessId,
        event === 'subscription.disable'
          ? 'Paystack subscription disabled'
          : 'Payment failed — moved to the free plan',
      );
      return { handled: event };
    }

    case 'charge.success': {
      const plan = await resolvePlanByPaystackCode(f.planCode ?? '');
      const amount = f.amountNaira;
      const ref = ctx.providerRef;

      // Initial native charge (or legacy SP-SUB-* session): a pre-recorded
      // transaction exists → settle it through the guarded flip.
      if (ctx.preRecordedTxn) {
        await applySubscriptionPaymentSuccess({
          businessId: ctx.preRecordedTxn.businessId,
          providerRef: ref,
          amount,
          authorizationCode: f.authorizationCode,
          customerCode: f.customerCode,
          subscriptionCode: f.subscriptionCode,
          planId: plan?.id ?? null,
        });
        return { handled: 'charge.success.initial' };
      }

      // Renewal / reactivation charge: no pre-recorded row, resolve by
      // subscription code (else owner email) and record + activate.
      const businessId = await resolveBusinessId(f.subscriptionCode, f.email);
      if (!businessId) return { handled: 'unresolved' };
      await applyNativeRenewalCharge({
        businessId,
        providerRef: ref,
        amount,
        planId: plan?.id ?? null,
        subscriptionCode: f.subscriptionCode ?? '',
        customerCode: f.customerCode,
        authorizationCode: f.authorizationCode,
      });
      return { handled: 'charge.success.renewal' };
    }

    default:
      return { handled: 'ignored' };
  }
}