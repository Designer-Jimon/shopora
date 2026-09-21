import Link from 'next/link';
import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { TicketActionRow, TicketCreateForm } from '../_components/actions';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};
const STATUS_STYLE: Record<string, string> = {
  open: 'bg-sky-100 text-sky-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};
const PRIORITY_STYLE: Record<string, string> = {
  low: 'text-gray-400',
  normal: 'text-gray-600',
  high: 'text-orange-600',
  urgent: 'text-red-600',
};
const fmtDate = (d: Date) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(d);

export default async function TicketsPage() {
  await requireAdminAccess();

  const [tickets, openCount, unassignedCount] = await Promise.all([
    prisma.supportTicket.findMany({
      include: {
        business: { select: { id: true, name: true, slug: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
        assignee: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
    prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] }, assigneeUserId: null } }),
  ]);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Support inbox</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          {openCount} open {openCount === 1 ? 'ticket' : 'tickets'} · {unassignedCount} unassigned.
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[t.status]}`}>
                {STATUS_LABELS[t.status] ?? t.status}
              </span>
              <span className={`text-xs font-bold uppercase tracking-wide ${PRIORITY_STYLE[t.priority] ?? ''}`}>
                {t.priority}
              </span>
              <span className="text-xs font-semibold text-[var(--color-text)]">{t.subject}</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">{fmtDate(t.updatedAt)}</span>
            </div>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
              {t.business && (
                <Link href={`/admin/subscribers/${t.business.id}`} className="font-semibold text-[var(--color-primary)] hover:underline">
                  {t.business.name}
                </Link>
              )}
              {t.user && <span>by {t.user.firstName} {t.user.lastName} ({t.user.email})</span>}
              {t.assignee && <span>→ {t.assignee.firstName} {t.assignee.lastName}</span>}
              <TicketActionRow id={t.id} />
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">
            No tickets yet.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-bold text-[var(--color-text)]">File a ticket</h2>
        <div className="mt-4">
          <TicketCreateForm />
        </div>
      </div>
    </div>
  );
}