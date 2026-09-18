'use client';

// SHOPORA — Payment Providers panel (Phase 8). Connects / disconnects the
// Paystack gateway. The secret key is sent to the API once (server-side,
// where it is encrypted at rest) and is NEVER stored or echoed on the client.

import { useState } from 'react';

export type ProviderSummary = {
  provider: string;
  status: 'connected' | 'disconnected';
  publicKey: string | null;
  connectedAt: string | null;
};

type Props = {
  initialProviders: ProviderSummary[];
};

const PROVIDER_META: Record<string, { name: string; tagline: string }> = {
  paystack: { name: 'Paystack', tagline: 'Cards, bank transfer, USSD & Apple Pay for Nigerian stores' },
};

export default function ProvidersPanel({ initialProviders }: Props) {
  const [providers, setProviders] = useState<ProviderSummary[]>(initialProviders);
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const paystack = providers.find((p) => p.provider === 'paystack');
  const connected = paystack?.status === 'connected';

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/payments/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'paystack', publicKey, secretKey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Could not connect Paystack.');
        return;
      }
      setProviders([{ ...data, connectedAt: data.connectedAt ?? null }]);
      setPublicKey('');
      setSecretKey('');
      setNotice('Paystack connected. New checkouts can offer online payment.');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Paystack? Orders already placed are unaffected.')) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/payments/providers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'paystack' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Could not disconnect Paystack.');
        return;
      }
      setProviders([{ provider: 'paystack', status: 'disconnected', publicKey: null, connectedAt: null }]);
      setNotice('Paystack disconnected. Checkout falls back to transfer / cash on delivery.');
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {paystack ? PROVIDER_META[paystack.provider]?.name ?? paystack.provider : 'Paystack'}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {PROVIDER_META.paystack.tagline}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                connected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </div>

        {connected ? (
          <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="text-sm text-[var(--color-text-muted)]">
              Public key: <span className="font-mono text-[var(--color-text)]">{paystack?.publicKey ?? '—'}</span>
            </div>
            {paystack?.connectedAt && (
              <div className="text-sm text-[var(--color-text-muted)]">
                Connected: {new Date(paystack.connectedAt).toLocaleString('en-NG')}
              </div>
            )}
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="mt-2 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <form onSubmit={connect} className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Public key
                <input
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="pk_test_…"
                  required
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </label>
              <label className="block text-xs font-medium text-[var(--color-text-muted)]">
                Secret key
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="sk_test_…"
                  required
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </label>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}
            >
              {busy ? 'Connecting…' : 'Connect Paystack'}
            </button>
          </form>
        )}

        {notice && <p className="mt-3 text-xs text-green-700">{notice}</p>}
      </div>

      <p className="mt-4 max-w-2xl text-xs text-[var(--color-text-muted)]">
        Secret keys are encrypted at rest and only used to sign requests and verify webhooks
        (HMAC-SHA512). Test keys: dashboard.paystack.com → Settings → API Keys &amp; Webhooks.
        Remember to set your webhook URL to <span className="font-mono">/api/webhooks/paystack</span>.
      </p>
    </div>
  );
}