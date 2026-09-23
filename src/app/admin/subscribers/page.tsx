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

const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d) : '—');

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SubscribersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminAccess();
  const sp = await searchParams;
  const q = String(sp.q ?? '').trim();
  const status = String(sp.status ?? '');
  const page = Math.max(1, parseInt(String(sp.page ?? '1'), 10) || 1);
  const pageSize = 25;

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }];

  const [rows, total] = await Promise.all([
    prisma.business.findMany({
      where,
      include: {
        subscription: { include: { plan: { select: { displayName: true, name: true } } } },
        _count: { select: { products: true, orders: true, staff: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.business.count({ where }),
  ]);

  const filtered = !status
    ? rows
    : status === 'none'
      ? rows.filter((b) => !b.subscription)
      : status === 'downgraded'
        ? rows.filter((b) => b.subscription?.status === 'active' && b.subscription?.plan.name === 'starter')
        : rows.filter((b) => b.subscription?.status === status);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Subscribers</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Every business on the platform and its subscription state.
        </p>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name or slug…"
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <select name="status" defaultValue={status} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {Object.keys(STATUS_LABELS).map((k) => <option key={k} value={k}>{STATUS_LABELS[k]}</option>)}
        </select>
        <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white">
          Filter
        </button>
        <span className="text-xs text-[var(--color-text-muted)]">{total} businesses</span>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Business</th>
              <th className="px-4 py-2 font-semibold">Plan</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Period ends</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Products</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Orders</th>
              <th className="px-4 py-2 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const st = b.subscription?.status ?? 'none';
              return (
                <tr key={b.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-tint, #f9fafb)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/subscribers/${b.id}`} className="font-bold text-[var(--color-primary)] hover:underline">
                      {b.name}
                    </Link>
                    <p className="text-[var(--color-text-muted)]">/{b.slug}{b.category ? ` · ${b.category}` : ''}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    {b.subscription ? (
                      <>
                        <span className="font-semibold text-[var(--color-text)]">{b.subscription.plan.displayName}</span>
                        {b.subscription.status === 'active' && b.subscription.plan.name === 'starter' && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700" title="Soft downgrade to Free (trial expired / payment failed)">
                            Downgraded
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[st]}`}>
                      {STATUS_LABELS[st] ?? st}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">
                    {b.subscription ? fmtDate(b.subscription.currentPeriodEnd) : '—'}
                  </td>
                  <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">{b._count.products}</td>
                  <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">{b._count.orders}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{fmtDate(b.createdAt)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No subscribers match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Link
            href={`/admin/subscribers?${new URLSearchParams({ q, status, page: String(Math.max(1, page - 1)) })}`}
            className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
          >
            Previous
          </Link>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <Link
            href={`/admin/subscribers?${new URLSearchParams({ q, status, page: String(page + 1) })}`}
            className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}