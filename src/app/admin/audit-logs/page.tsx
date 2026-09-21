import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const fmtDate = (d: Date) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminAccess();
  const sp = await searchParams;
  const action = String(sp.action ?? '');
  const q = String(sp.q ?? '').trim();
  const page = Math.max(1, parseInt(String(sp.page ?? '1'), 10) || 1);
  const pageSize = 50;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (q) where.target = { contains: q, mode: 'insensitive' };

  const [logs, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        business: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Audit log</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Immutable trail of privileged platform actions (impersonations, suspensions, plan changes, admin changes).
        </p>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
        <select name="action" defaultValue={action} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Filter by target (slug, email, plan)…"
          className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]" />
        <button type="submit" className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-white">Filter</button>
        <span className="text-xs text-[var(--color-text-muted)]">{total} entries</span>
      </form>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Time</th>
              <th className="px-4 py-2 font-semibold">Action</th>
              <th className="px-4 py-2 font-semibold">Target</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Actor</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Business</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-2 text-[var(--color-text-muted)]">{fmtDate(l.createdAt)}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-[var(--color-tint, #f9fafb)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-text)]">
                    {l.action}
                  </span>
                </td>
                <td className="px-4 py-2 font-semibold text-[var(--color-text)]">{l.target ?? '—'}</td>
                <td className="hidden px-4 py-2 text-[var(--color-text-muted)] md:table-cell">
                  {l.actor ? `${l.actor.firstName} ${l.actor.lastName}`.trim() || l.actor.email : 'system'}
                </td>
                <td className="hidden px-4 py-2 md:table-cell">
                  {l.business ? (
                    <Link href={`/admin/subscribers/${l.business.id}`} className="font-semibold text-[var(--color-primary)] hover:underline">
                      {l.business.name}
                    </Link>
                  ) : (
                    <span className="text-[var(--color-text-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No audit entries match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Link href={`/admin/audit-logs?${new URLSearchParams({ action, q, page: String(Math.max(1, page - 1)) })}`}
            className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}>
            Previous
          </Link>
          <span className="text-xs text-[var(--color-text-muted)]">Page {page} of {totalPages}</span>
          <Link href={`/admin/audit-logs?${new URLSearchParams({ action, q, page: String(page + 1) })}`}
            className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}>
            Next
          </Link>
        </div>
      )}
    </div>
  );
}