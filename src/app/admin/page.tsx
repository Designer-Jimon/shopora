import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { SUBSCRIPTION_STATUSES } from '@/lib/subscriptions/plans';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  none: 'No plan',
};

const fmtNaira = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);

export default async function AdminOverviewPage() {
  const access = await requireAdminAccess();

  const now = new Date();
  const days30 = new Date(now.getTime() - 30 * 86400_000);

  const [totalBusinesses, totalUsers, byStatus, noSubscription, recentUsers, recentBusinesses, revenueAware, orderTotals] =
    await Promise.all([
      prisma.business.count(),
      prisma.user.count(),
      prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.business.count({ where: { subscription: null } }),
      prisma.user.count({ where: { createdAt: { gte: days30 } } }),
      prisma.business.count({ where: { createdAt: { gte: days30 } } }),
      prisma.subscription.findMany({
        where: { status: { in: [SUBSCRIPTION_STATUSES.active, SUBSCRIPTION_STATUSES.pastDue] } },
        select: { billingCycle: true, plan: { select: { monthlyPriceNaira: true, annualPriceNaira: true } } },
      }),
      prisma.transaction.aggregate({
        where: { status: 'success', type: 'payment', createdAt: { gte: days30 } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

  const counts: Record<string, number> = {
    trial: 0,
    active: 0,
    past_due: 0,
    suspended: 0,
    cancelled: 0,
    none: noSubscription,
  };
  for (const row of byStatus) counts[row.status] = row._count._all;

  let mrr = 0;
  for (const s of revenueAware) {
    const appAmount = s.billingCycle === 'annual' ? Number(s.plan.annualPriceNaira) / 12 : Number(s.plan.monthlyPriceNaira);
    if (Number.isFinite(appAmount)) mrr += appAmount;
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Platform overview</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Real-time metrics across every SHOPORA business.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">MRR</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-text)]">{fmtNaira(mrr)}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{revenueAware.length} paying subscriptions</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Businesses</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-text)]">{totalBusinesses}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">+{recentBusinesses} in last 30 days</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Users</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-text)]">{totalUsers}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">+{recentUsers} in last 30 days</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Order volume (30d)</p>
          <p className="mt-2 text-2xl font-black text-[var(--color-text)]">{fmtNaira(Number(orderTotals._sum.amount ?? 0))}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">{orderTotals._count._all} paid orders</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">Subscriptions by status</p>
          <div className="mt-3 space-y-3">
            {Object.entries(counts).map(([key, value]) => (
              <div key={key}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-muted)]">{STATUS_LABELS[key] ?? key}</span>
                  <span className="font-semibold text-[var(--color-text)]">{value}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${totalBusinesses > 0 ? Math.round((value / totalBusinesses) * 100) : 0}%`,
                      background: key === 'suspended' || key === 'cancelled' ? 'var(--color-danger, #dc2626)' : 'var(--color-primary)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Link href="/admin/subscribers" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)]">
            View all subscribers →
          </Link>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">Quick actions</p>
          <ul className="mt-3 space-y-2 text-sm">
            {[
              { href: '/admin/subscriptions/plans', label: 'Manage subscription plans' },
              { href: '/admin/platform/admins', label: 'Manage platform admins' },
              { href: '/admin/coupons', label: 'Create coupons' },
              { href: '/admin/tickets', label: 'Support inbox' },
              { href: '/admin/audit-logs', label: 'Audit log' },
            ].filter((a) =>
              (a.href === '/admin/subscriptions/plans' && access.permissions.includes('platform.plans.manage')) ||
              (a.href === '/admin/platform/admins' && access.permissions.includes('platform.admins.manage')) ||
              (a.href === '/admin/coupons' && access.permissions.includes('platform.coupons.manage')) ||
              (a.href === '/admin/tickets' && access.permissions.includes('platform.tickets.manage')) ||
              (a.href === '/admin/audit-logs' && access.permissions.includes('platform.audit.read')),
            ).map((a) => (
              <li key={a.href}>
                <Link href={a.href} className="text-[var(--color-primary)] hover:underline">
                  {a.label} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}