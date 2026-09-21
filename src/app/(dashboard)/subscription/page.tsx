import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import { getSubscriptionState } from '@/lib/subscriptions/state';
import { formatNaira } from '@/lib/subscriptions/plans';
import SubscriptionControls, { type SubscriptionPlanSummary } from './_components/SubscriptionControls';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  trial: 'Free trial',
  active: 'Active',
  past_due: 'Payment overdue (grace)',
  suspended: 'Suspended — checkout paused',
  cancelled: 'Cancelled — store offline',
};

const fmtDate = (d: Date | null): string =>
  d ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d) : '—';

export default async function SubscriptionPage() {
  const access = await requireDashboardAccess();
  if (!access.permissions.includes('subscription.manage') && access.businessRole !== 'Owner') {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscription</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">
          You don&apos;t have permission to manage this store&apos;s subscription.
        </p>
      </div>
    );
  }

  const [state, plans, productsCount, staffCount, history] = await Promise.all([
    getSubscriptionState(access.businessId),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.product.count({ where: { businessId: access.businessId } }),
    prisma.businessStaff.count({
      where: { businessId: access.businessId, role: { name: { not: 'Owner' } }, isActive: true },
    }),
    prisma.subscriptionHistory.findMany({
      where: { subscription: { businessId: access.businessId } },
      orderBy: { changedAt: 'desc' },
      take: 10,
    }),
  ]);

  const planSummaries: SubscriptionPlanSummary[] = plans.map((p) => ({
    key: p.name,
    displayName: p.displayName,
    description: p.description ?? '',
    monthlyPriceNaira: Number(p.monthlyPriceNaira),
    annualPriceNaira: Number(p.annualPriceNaira),
    productLimit: p.productLimit,
    staffLimit: p.staffLimit,
    customDomain: p.customDomain,
    analyticsTier: p.analyticsTier,
  }));

  const isCancelled = state.status === 'cancelled';
  const currentPlan = plans.find((p) => p.name === state.planKey);
  const currentPlanPrice = currentPlan
    ? Number(state.billingCycle === 'annual' ? currentPlan.annualPriceNaira : currentPlan.monthlyPriceNaira)
    : 0;
  const usageBar = (used: number, limit: number) => {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
    return (
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--color-danger, #dc2626)' : 'var(--color-primary)' }}
        />
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscription</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Your plan, billing, and usage. Payments are handled by Paystack.
          </p>
        </div>
        <span
          className="inline-flex self-start rounded-full px-3 py-1 text-xs font-bold"
          style={{ background: 'var(--color-tint, #f3f4f6)', color: 'var(--color-text)' }}
        >
          {STATUS_LABELS[state.status] ?? state.status}
        </span>
      </div>

      {isCancelled && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Your subscription was cancelled and your storefront is offline. Choose a plan below to
          reactivate — your data has been kept.
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[var(--color-text)]">{state.planDisplayName} plan</p>
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">{formatNaira(currentPlanPrice)}/{state.billingCycle === 'annual' ? 'yr' : 'mo'}</span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <dt className="text-[var(--color-text-muted)]">Status</dt>
              <dd className="font-semibold text-[var(--color-text)]">{STATUS_LABELS[state.status] ?? state.status}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-text-muted)]">Period ends</dt>
              <dd className="font-semibold text-[var(--color-text)]">{fmtDate(state.currentPeriodEnd)}</dd>
            </div>
            {state.trialEndsAt && (
              <div>
                <dt className="text-[var(--color-text-muted)]">Trial ends</dt>
                <dd className="font-semibold text-[var(--color-text)]">{fmtDate(state.trialEndsAt)}</dd>
              </div>
            )}
            <div>
              <dt className="text-[var(--color-text-muted)]">Billing</dt>
              <dd className="font-semibold text-[var(--color-text)]">{state.billingCycle === 'annual' ? 'Annual' : 'Monthly'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">Usage</p>
          <div className="mt-3 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)]">Products</span>
                <span className="font-semibold text-[var(--color-text)]">{productsCount} / {state.productLimit}</span>
              </div>
              <div className="mt-1.5">{usageBar(productsCount, state.productLimit)}</div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-muted)]">Staff members</span>
                <span className="font-semibold text-[var(--color-text)]">{staffCount} / {state.staffLimit}</span>
              </div>
              <div className="mt-1.5">{usageBar(staffCount, state.staffLimit)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <SubscriptionControls
          currentPlanKey={state.planKey}
          status={state.status}
          billingCycle={state.billingCycle}
          plans={planSummaries}
        />
      </div>

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-bold text-[var(--color-text)]">Billing history</h2>
          <div className="mt-2 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Change</th>
                  <th className="px-4 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-[var(--color-border)]">
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{fmtDate(h.changedAt)}</td>
                    <td className="px-4 py-2 font-semibold text-[var(--color-text)]">
                      {h.fromStatus ? `${h.fromStatus.replace('_', ' ')} → ` : ''}{h.toStatus.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-2 text-[var(--color-text-muted)]">{h.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}