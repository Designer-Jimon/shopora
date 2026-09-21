import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { CouponCreateForm, CouponToggleChip } from '../_components/actions';

export const dynamic = 'force-dynamic';

const fmtNaira = (n: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(d) : '—');

export default async function CouponsPage() {
  await requireAdminAccess();

  const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Coupons</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Platform-wide discount codes. Applied at checkout across all stores.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--color-tint, #f9fafb)] text-[var(--color-text-muted)]">
            <tr>
              <th className="px-4 py-2 font-semibold">Code</th>
              <th className="px-4 py-2 font-semibold">Value</th>
              <th className="px-4 py-2 font-semibold">Usage</th>
              <th className="px-4 py-2 font-semibold hidden md:table-cell">Valid</th>
              <th className="px-4 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-t border-[var(--color-border)]">
                <td className="px-4 py-2.5 font-bold text-[var(--color-text)]">{c.code}</td>
                <td className="px-4 py-2.5 font-semibold">
                  {c.kind === 'percentage' ? `${Number(c.value)}% off` : `${fmtNaira(Number(c.value))} off`}
                  {c.minOrderAmount !== null && <span className="text-[var(--color-text-muted)]"> · min {fmtNaira(Number(c.minOrderAmount))}</span>}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                  {c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}
                </td>
                <td className="hidden px-4 py-2.5 text-[var(--color-text-muted)] md:table-cell">
                  {c.startsAt ? `from ${fmtDate(c.startsAt)}` : 'from now'}
                  {c.expiresAt ? ` · until ${fmtDate(c.expiresAt)}` : ' · no expiry'}
                </td>
                <td className="px-4 py-2.5">
                  <CouponToggleChip id={c.id} code={c.code} isActive={c.isActive} />
                </td>
              </tr>
            ))}
            {coupons.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No coupons yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-bold text-[var(--color-text)]">Create a coupon</h2>
        <div className="mt-4">
          <CouponCreateForm />
        </div>
      </div>
    </div>
  );
}