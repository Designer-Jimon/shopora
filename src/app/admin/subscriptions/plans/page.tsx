import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { PlanArchiveButton, PlanCreateForm } from '../../_components/actions';

export const dynamic = 'force-dynamic';

const fmtNaira = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default async function PlansPage() {
  const access = await requireAdminAccess();
  if (!access.permissions.includes('platform.plans.manage')) {
    return <p className="text-sm text-[var(--color-text-muted)]">You don&apos;t have permission to manage plans.</p>;
  }

  const [plans, activeSubCounts] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    }),
    prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: { notIn: ['cancelled'] } },
      _count: { _all: true },
    }),
  ]);
  const activeByPlan = new Map(activeSubCounts.map((r) => [r.planId, r._count._all]));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscription plans</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          The plan catalogue. Seeding is create-only, so changes here are never overwritten.
          Archiving a plan stops new signups; existing subscribers keep it.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Plan</th>
              <th className="px-4 py-2 font-semibold">Monthly</th>
              <th className="px-4 py-2 font-semibold">Annual</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Limits</th>
              <th className="px-4 py-2 font-semibold">Subscribers</th>
              <th className="px-4 py-2 font-semibold">State</th>
              <th className="px-4 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => {
              const total = p._count.subscriptions;
              const inUse = activeByPlan.get(p.id) ?? 0;
              return (
                <tr key={p.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-[var(--color-text)]">{p.displayName}</span>
                    <p className="text-[var(--color-text-muted)]">{p.name}{p.description ? ` — ${p.description}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{fmtNaira(Number(p.monthlyPriceNaira))}</td>
                  <td className="px-4 py-2.5 font-semibold">{fmtNaira(Number(p.annualPriceNaira))}</td>
                  <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">
                    {p.productLimit} products · {p.staffLimit} staff
                    {p.customDomain ? ' · custom domain' : ''} · {p.analyticsTier}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{total} ({inUse} active)</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.isActive ? 'Offered' : 'Archived'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.isActive && (
                      <PlanArchiveButton id={p.id} name={p.displayName} subscriberCount={inUse} disabled={inUse > 0} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-bold text-[var(--color-text)]">Create a new plan</h2>
        <div className="mt-4">
          <PlanCreateForm />
        </div>
      </div>
    </div>
  );
}