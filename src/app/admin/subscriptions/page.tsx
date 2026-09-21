import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
};
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-sky-100 text-sky-700',
  past_due: 'bg-orange-100 text-orange-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-600',
};
const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d) : '—');
const fmtNaira = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default async function SubscriptionsPage() {
  await requireAdminAccess();

  const [subs, planAgg] = await Promise.all([
    prisma.subscription.findMany({
      include: {
        business: { select: { id: true, name: true, slug: true } },
        plan: { select: { name: true, displayName: true, monthlyPriceNaira: true, annualPriceNaira: true } },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      take: 200,
    }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of planAgg) counts[row.status] = row._count._all;

  const mrr = subs
    .filter((s) => s.status === 'active' || s.status === 'past_due')
    .reduce((acc, s) => {
      const app = s.billingCycle === 'annual' ? Number(s.plan.annualPriceNaira) / 12 : Number(s.plan.monthlyPriceNaira);
      return acc + (Number.isFinite(app) ? app : 0);
    }, 0);

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscriptions</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Active billing across the platform · MRR {fmtNaira(mrr)}.
          </p>
        </div>
        <Link href="/admin/subscriptions/plans" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white">
          Manage plans
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className="rounded-full px-2.5 py-1 font-semibold text-[var(--color-text-muted)]">
            {STATUS_LABELS[k] ?? k}: <b className="text-[var(--color-text)]">{v}</b>
          </span>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Business</th>
              <th className="px-4 py-2 font-semibold">Plan</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Cycle</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Period ends</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Trial ends</th>
            </tr>
          </thead>
          <tbody>
            {subs.map((sub) => (
              <tr key={sub.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-tint, #f9fafb)]">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/subscribers/${sub.business.id}`} className="font-bold text-[var(--color-primary)] hover:underline">
                    {sub.business.name}
                  </Link>
                  <p className="text-[var(--color-text-muted)]">/{sub.business.slug}</p>
                </td>
                <td className="px-4 py-2.5 font-semibold text-[var(--color-text)]">
                  {sub.plan.displayName}
                  <p className="text-[var(--color-text-muted)]">{fmtNaira(Number(sub.billingCycle === 'annual' ? sub.plan.annualPriceNaira : sub.plan.monthlyPriceNaira))}/{sub.billingCycle === 'annual' ? 'yr' : 'mo'}</p>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[sub.status]}`}>
                    {STATUS_LABELS[sub.status] ?? sub.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{sub.billingCycle}</td>
                <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">{fmtDate(sub.currentPeriodEnd)}</td>
                <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">{fmtDate(sub.trialEndsAt)}</td>
              </tr>
            ))}
            {subs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No subscriptions yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}