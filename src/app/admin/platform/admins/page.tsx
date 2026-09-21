import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { AdminGrantForm, AdminRowActions } from '../../_components/actions';

export const dynamic = 'force-dynamic';

const fmtDate = (d: Date) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d);

export default async function PlatformAdminsPage() {
  const access = await requireAdminAccess();
  if (!access.permissions.includes('platform.admins.manage')) {
    return <p className="text-sm text-[var(--color-text-muted)]">You don&apos;t have permission to manage platform admins.</p>;
  }

  const [staff, roles] = await Promise.all([
    prisma.platformStaff.findMany({
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true } },
        role: { select: { id: true, name: true, permissions: { include: { permission: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.role.findMany({
      where: { OR: [{ name: 'Platform Super Admin' }, { name: 'Platform Admin' }] },
      select: { id: true, name: true, description: true, permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);

  const superActiveCount = staff.filter((s) => s.role.name === 'Platform Super Admin' && s.isActive).length;

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Platform admins</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Users with access to the Super Admin dashboard. Membership is audited — every change is in the audit log.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Admin</th>
              <th className="px-4 py-2 font-semibold">Role</th>
              <th className="px-4 py-2 font-semibold">Member since</th>
              <th className="px-4 py-2 font-semibold">State</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => {
              const self = s.user.id === access.userId;
              const lastSuper = s.role.name === 'Platform Super Admin' && s.isActive && superActiveCount <= 1;
              return (
                <tr key={s.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-[var(--color-text)]">
                      {s.user.firstName} {s.user.lastName}
                    </span>
                    <p className="text-[var(--color-text-muted)]">{s.user.email}</p>
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[var(--color-text)]">{s.role.name}</td>
                  <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{fmtDate(s.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.user.isActive ? 'bg-sky-100 text-sky-700' : 'bg-red-100 text-red-700'}`}>
                        {s.user.isActive ? 'Login enabled' : 'Login disabled'}
                      </span>
                      {self && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">You</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <AdminRowActions
                      id={s.id}
                      isActive={s.isActive}
                      userIsActive={s.user.isActive}
                      self={self}
                      lastSuper={lastSuper}
                      roleOptions={roles.map((r) => ({ id: r.id, name: r.name }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <h2 className="text-sm font-bold text-[var(--color-text)]">Grant admin access</h2>
          <div className="mt-4">
            <AdminGrantForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <h2 className="text-sm font-bold text-[var(--color-text)]">Roles & permissions</h2>
          <div className="mt-2 space-y-4">
            {roles.map((r) => (
              <div key={r.id}>
                <p className="text-sm font-semibold text-[var(--color-text)]">{r.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{r.description}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.permissions.map((p) => (
                    <span key={p.permission.name} className="rounded bg-[var(--color-tint, #f9fafb)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                      {p.permission.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}