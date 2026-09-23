'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatNaira } from '@/lib/subscriptions/plans';

export type BillingPlanSummary = {
  key: string;
  displayName: string;
  description: string;
  monthlyPriceNaira: number;
  productLimit: number;
  staffLimit: number;
  orderLimit: number;
  customDomain: boolean;
  removeBranding: boolean;
  analyticsTier: string;
};

type Props = {
  currentPlanKey: string;
  status: string;
  onFreePlan: boolean;
  plans: BillingPlanSummary[];
};

const limit = (n: number) => (n >= 999999 ? 'Unlimited' : n);

export default function BillingControls({ currentPlanKey, status, onFreePlan, plans }: Props) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(currentPlanKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const alreadyOnPlan = selectedPlan === currentPlanKey && status === 'active';

  async function goToCheckout() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey: selectedPlan, billingCycle: 'monthly' }),
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
      if (data?.mode === 'free_activation') {
        setNotice(data?.message ?? 'Done — you are now on the Free plan.');
        router.refresh();
        return;
      }
      if (data?.mode === 'current_plan') {
        setNotice('You are already on this plan.');
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

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-text-muted)]">Billing cycle</span>
        <span className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)]">
          Monthly
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">recurring via Paystack — no annual commitment</span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
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
                {formatNaira(plan.monthlyPriceNaira)}
                <span className="text-sm font-semibold text-[var(--color-text-muted)]">/mo</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-[var(--color-text-muted)]">
                <li>· Up to {limit(plan.productLimit)} products</li>
                <li>· Up to {limit(plan.staffLimit)} staff members</li>
                <li>· Up to {limit(plan.orderLimit)} orders/month</li>
                <li>· {plan.customDomain ? 'Custom domain support' : 'shopora.store subdomain'}</li>
                {plan.removeBranding ? <li>· Removes the “Powered by SHOPORA” mark</li> : null}
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
          {busy
            ? 'Working…'
            : alreadyOnPlan
              ? 'Current plan'
              : selectedPlan === currentPlanKey && status === 'trial'
                ? 'Activate this plan'
                : selectedPlan === 'starter'
                  ? 'Move to Free plan'
                  : 'Switch to this plan'}
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">
          {onFreePlan
            ? 'Instant activation — no card needed.'
            : 'Payment is handled securely by Paystack.'}
        </span>
      </div>
    </div>
  );
}