// SHOPORA Paystack provider — implements the PaymentProvider interface for
// Paystack (hosted checkout). Phase 8. Flutterwave can implement the same
// interface later; nothing here leaks into call-site code.
//
// Keys: the secret is injected at construction, decrypted server-side from the
// secret store, and never stored/returned by this module.

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type PaymentProvider,
  type PaymentProviderName,
  type InitializeTransactionInput,
  type InitializeTransactionResult,
  type VerifyTransactionResult,
  type ParsedWebhook,
} from './types';

const PAYSTACK_API = 'https://api.paystack.co';
const TIMEOUT_MS = 15000;

async function paystackFetch(url: string, init: RequestInit): Promise<Response> {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT_MS) : undefined;
  return fetch(url, { ...init, signal });
}

function hexEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export class PaystackProvider implements PaymentProvider {
  name: PaymentProviderName = 'paystack';

  constructor(private readonly secret: string | null) {}

  async initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
    const { amount, email, callbackUrl } = input;
    const reference = `SP-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (!this.secret) return { ok: false, error: 'Paystack secret key is not configured' };

    try {
      const res = await paystackFetch(`${PAYSTACK_API}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // kobo
          email,
          reference,
          callback_url: callbackUrl,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.status) {
        return { ok: false, error: data?.message ?? `Paystack initialize failed (${res.status})` };
      }
      return {
        ok: true,
        providerRef: String(data.data?.reference ?? reference),
        authorizationUrl: String(data.data?.authorization_url ?? ''),
      };
    } catch {
      return { ok: false, error: 'Could not reach Paystack to start payment' };
    }
  }

  async verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
    if (!this.secret) return { status: 'unknown', amountPaid: null, providerRef: reference };
    try {
      const res = await paystackFetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${this.secret}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.status) {
        return { status: 'unknown', amountPaid: null, providerRef: reference };
      }
      const statusRaw = String(data.data?.status ?? 'unknown');
      const amountKobo = Number(data.data?.amount ?? 0);
      const status =
        statusRaw === 'success' ? 'success' : ['failed', 'abandoned'].includes(statusRaw) ? 'failed' : 'pending';
      return {
        status,
        amountPaid: Number.isFinite(amountKobo) ? amountKobo / 100 : null,
        providerRef: String(data.data?.reference ?? reference),
      };
    } catch {
      return { status: 'unknown', amountPaid: null, providerRef: reference };
    }
  }

  /**
   * Paystack signs the RAW request body with HMAC-SHA512 of the secret key.
   * Header: `x-paystack-signature`. Returns true only when the signature
   * matches and came from a process that knows the secret.
   */
  verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    if (!secret) return false;
    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    return hexEquals(expected, signature.trim());
  }

  parseWebhook(rawBody: string): ParsedWebhook | null {
    try {
      const json = JSON.parse(rawBody) as { event?: unknown; data?: Record<string, unknown> };
      const event = String(json.event ?? '');
      const data = json.data;
      const providerRef = String((data as Record<string, unknown> | undefined)?.reference ?? '');
      if (!event || !providerRef) return null;
      return { event, providerRef, data: (data ?? {}) as Record<string, never> };
    } catch {
      return null;
    }
  }
}

/** Convenience helper: HMAC-SHA512 expected signature (used in tests/docs). */
export function paystackExpectedSignature(rawBody: string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}