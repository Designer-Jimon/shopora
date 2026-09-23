// SHOPORA — Admin subscriber detail. Server component, mirrors the list page's
// styling. Loads the business with its subscription + plan, usage counts, staff,
// payment providers and recent orders; renders status + owner + quiet fallbacks.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { ImpersonateButton, SuspendReactivateButton } from '@/app/admin/_components/actions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  trial: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  suspended: 'Suspended',
  cancelled: 'Cancelled',
  downgraded: 'Downgraded',
  none: 'No plan',
};

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-sky-100 text-sky-700',
  past_due: 'bg-orange-100 text-orange-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-600',
  downgraded: 'bg-amber-100 text-amber-700',
  none: 'bg-gray-100 text-gray-500',
};

const fmtDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d) : '—';
const fmtMoney = (n: { toString(): string } | string | number | null | undefined) =>
  n != null ? `₦${Number(n).toLocaleString('en-NG')}` : '—';

export default async function SubscriberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAccess();
  const { id } = await params;

  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      staff: {
        include: { user: { select: { email: true, firstName: true, lastName: true } }, role: true },
        orderBy: { createdAt: 'asc' },
      },
      paymentProviders: { select: { provider: true, status: true, updatedAt: true } },
      _count: { select: { products: true, orders: true, categories: true } },
    },
  });

  if (!business) notFound();

  const owner = business.staff.find((member) => member.role.name === 'Owner' && member.isActive);
  const subscription = business.subscription;
  const st = subscription?.status ?? 'none';

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/subscribers"
            className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            ← All subscribers
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)]">
            {business.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-muted)]">
            <span>/ {business.slug}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[st] ?? STATUS_STYLE.none}`}
            >
              {STATUS_LABELS[st] ?? 'No plan'}
            </span>
            {subscription?.status === 'active' && subscription?.plan.name === 'starter' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Downgraded to Free — trial expired / payment failed
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {subscription && (
            <SuspendReactivateButton businessId={business.id} status={subscription.status} />
          )}
          <ImpersonateButton businessId={business.id} businessName={business.name} />
        </div>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
        {business.description || 'No business description provided.'}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Subscription</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">
            {subscription?.plan.displayName ?? 'No paid plan'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {subscription ? `${fmtMoney(subscription.plan.monthlyPriceNaira)}/mo` : 'Free business profile'}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Products / Orders</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">
            {business._count.products}
            <span className="text-sm font-normal text-[var(--color-text-muted)]"> products · </span>
            {business._count.orders}
            <span className="text-sm font-normal text-[var(--color-text-muted)]"> orders</span>
          </p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Period ends</p>
          <p className="mt-2 text-lg font-bold text-[var(--color-text)]">
            {subscription ? fmtDate(subscription.currentPeriodEnd) : '—'}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-bold text-[var(--color-text)]">Owner & staff</h2>
          <ul className="mt-3 space-y-3">
            {business.staff.length === 0 && (
              <li className="text-sm text-[var(--color-text-muted)]">No staff found.</li>
            )}
            {business.staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {member.user.firstName} {member.user.lastName}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">{member.user.email}</p>
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {member.role.name}
                  {member.id === owner?.id ? ' · Owner' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-bold text-[var(--color-text)]">Payment providers</h2>
          <ul className="mt-3 space-y-3">
            {business.paymentProviders.length === 0 && (
              <li className="text-sm text-[var(--color-text-muted)]">None connected.</li>
            )}
            {business.paymentProviders.map((provider) => (
              <li key={provider.provider} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--color-text)]">{provider.provider}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{provider.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
