'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatNaira } from '@/lib/subscriptions/plans';

export type SubscriptionPlanSummary = {
  key: string;
  displayName: string;
  description: string;
  monthlyPriceNaira: number;
  annualPriceNaira: number;
  productLimit: number;
  staffLimit: number;
  customDomain: boolean;
  analyticsTier: string;
};

type Props = {
  currentPlanKey: string;
  status: string;
  billingCycle: 'monthly' | 'annual';
  plans: SubscriptionPlanSummary[];
};

export default function SubscriptionControls({ currentPlanKey, status, billingCycle, plans }: Props) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(currentPlanKey);
  const [cycle, setCycle] = useState<'monthly' | 'annual'>(billingCycle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const paying = status === 'active' || status === 'past_due' || status === 'suspended';

  async function goToCheckout() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: selectedPlan, billingCycle: cycle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? 'Could not reach the billing service');
        return;
      }
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      if (data?.mode === 'renewal_charge') {
        setNotice('Payment started — your subscription will activate once Paystack confirms it.');
        router.refresh();
        return;
      }
      setError('Unexpected billing response');
    } catch {
      setError('Network error — please try again');
    } finally {
      setBusy(false);
    }
  }

  const alreadyOnPlan = selectedPlan === currentPlanKey && status === 'active';

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-text-muted)]">Billing cycle</span>
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-0.5 text-xs font-semibold">
          {(['monthly', 'annual'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`rounded-md px-3 py-1.5 transition ${cycle === c ? 'text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
              style={cycle === c ? { background: 'var(--color-primary)' } : undefined}
            >
              {c === 'monthly' ? 'Monthly' : 'Annual (2 months free)'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const price = cycle === 'monthly' ? plan.monthlyPriceNaira : plan.annualPriceNaira;
          const isCurrent = plan.key === currentPlanKey && status === 'active';
          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => setSelectedPlan(plan.key)}
              className={`flex flex-col rounded-xl border bg-white p-5 text-left transition ${selectedPlan === plan.key ? 'ring-2' : 'hover:border-[var(--color-primary)]'}`}
              style={selectedPlan === plan.key ? { borderColor: 'var(--color-primary)' } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-[var(--color-text)]">{plan.displayName}</span>
                {isCurrent && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: 'var(--color-primary)' }}>
                    Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{plan.description}</p>
              <p className="mt-3 text-2xl font-black text-[var(--color-text)]">
                {formatNaira(price)}
                <span className="text-sm font-semibold text-[var(--color-text-muted)]">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-[var(--color-text-muted)]">
                <li>· Up to {plan.productLimit} products</li>
                <li>· Up to {plan.staffLimit} staff members</li>
                <li>· {plan.customDomain ? 'Custom domain support' : 'shopora.store subdomain'}</li>
                <li>· {plan.analyticsTier === 'advanced' ? 'Advanced analytics' : 'Basic analytics'}</li>
              </ul>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          disabled={busy || alreadyOnPlan}
          onClick={goToCheckout}
          className="rounded-lg px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? 'Working…' : paying ? (alreadyOnPlan ? 'Current plan' : 'Switch to this plan') : 'Activate with this plan'}
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          Payment is handled securely by Paystack.
        </span>
      </div>
    </div>
  );
}