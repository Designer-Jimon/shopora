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
  downgraded: 'Downgraded',
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

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Phase 11 — a "downgraded" subscription is one ACTIVE on the Free plan
// (usually because the trial expired or a payment failed).
const FREE_PLAN = 'starter';
const DOWNGRADED = 'downgraded';

export default async function SubscriptionsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminAccess();
  const sp = await searchParams;
  const status = String(sp.status ?? '').trim();

  const where: Record<string, unknown> = {};
  if (status === DOWNGRADED) where.status = 'active';
  else if (status) where.status = status;
  if (status === DOWNGRADED) where.plan = { name: FREE_PLAN };

  const [subs, revenueSubs, planAgg, downgradedCount] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        business: { select: { id: true, name: true, slug: true } },
        plan: { select: { name: true, displayName: true, monthlyPriceNaira: true, annualPriceNaira: true } },
      },
      orderBy: { currentPeriodEnd: 'desc' },
      take: 200,
    }),
    prisma.subscription.findMany({
      where: { status: { in: ['active', 'past_due'] } },
      select: {
        billingCycle: true,
        plan: { select: { monthlyPriceNaira: true, annualPriceNaira: true } },
      },
    }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.subscription.count({
      where: { status: 'active', plan: { name: FREE_PLAN } },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of planAgg) counts[row.status] = row._count._all;
  counts[DOWNGRADED] = downgradedCount;

  const mrr = revenueSubs.reduce((acc, s) => {
    const app = s.billingCycle === 'annual' ? Number(s.plan.annualPriceNaira) / 12 : Number(s.plan.monthlyPriceNaira);
    return acc + (Number.isFinite(app) ? app : 0);
  }, 0);

  return (
    <div>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscriptions</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Every business on the platform and its billing state · MRR {fmtNaira(mrr)}.
          </p>
        </div>
        <Link href="/admin/subscriptions/plans" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white">
          Manage plans
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(counts).map(([k, v]) => {
          const active = status === k;
          return (
            <Link
              key={k}
              href={active ? '/admin/subscriptions' : `/admin/subscriptions?status=${encodeURIComponent(k)}`}
              className={`rounded-full px-2.5 py-1 font-semibold transition ${
                active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)]'
              }`}
              title={active ? `Clear filter — show all subscriptions` : `Filter to ${STATUS_LABELS[k] ?? k} subscriptions`}
            >
              {STATUS_LABELS[k] ?? k}: <b className={active ? '' : 'text-[var(--color-text)]'}>{v}</b>
            </Link>
          );
        })}
        {status && (
          <Link href="/admin/subscriptions" className="rounded-full px-2.5 py-1 font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
            ✕ Clear filter
          </Link>
        )}
      </div>

      {status && (
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            Showing {STATUS_LABELS[status] ?? status} subscriptions only.
          </p>
        )}

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
                  {sub.status === 'active' && sub.plan.name === FREE_PLAN && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700" title="Soft downgrade to Free (trial expired / payment failed)">
                      Downgraded
                    </span>
                  )}
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
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  {status ? `No ${STATUS_LABELS[status] ?? status} subscriptions match.` : 'No subscriptions yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}