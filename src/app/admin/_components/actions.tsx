'use client';

// SHOPORA — Super Admin interactive widgets. All of these POST/PATCH/DELETE
// against the /api/admin routes and then revalidate the current page, keeping
// server components as the source of rendering truth.

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

function useActionState() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return { busy, setBusy, error, setError, notice, setNotice };
}

type ApiResult = { ok: boolean; status: number; data: unknown };

function getApiMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err) return err;
  }
  return fallback;
}

async function postJson(url: string, body: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

async function sendJson(method: 'PATCH' | 'DELETE' | 'PUT', url: string, body?: unknown): Promise<ApiResult> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

const btnPrimary =
  'rounded-md px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50';
const btnGhost =
  'rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50';

function ActionButtons({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-2">{children}</span>;
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-semibold text-red-600">{message}</p>;
}

export function NoticeNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="mt-2 text-xs font-semibold text-emerald-600">{message}</p>;
}

// ── Subscribers ────────────────────────────────────────────────────────────

export function ImpersonateButton({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const s = useActionState();
  async function start() {
    s.setBusy(true); s.setError(null);
    try {
      const r = await postJson('/api/admin/impersonate', { businessId });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Failed to start impersonation')); return; }
      window.location.href = '/dashboard';
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <ActionButtons>
      <button type="button" disabled={s.busy} onClick={start} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50">
        Log in as {businessName}
      </button>
      <ErrorNote message={s.error} />
    </ActionButtons>
  );
}

export function SuspendReactivateButton({ businessId, status }: { businessId: string; status: string }) {
  const router = useRouter();
  const s = useActionState();
  const isSuspended = status === 'suspended';
  async function go() {
    if (!confirm(isSuspended ? 'Reactivate this business? Its store (if it lapsed) will come back online.' : 'Suspend this business?')) return;
    s.setBusy(true); s.setError(null);
    try {
      const url = `/api/admin/subscribers/${businessId}/${isSuspended ? 'reactivate' : 'suspend'}`;
      const r = await postJson(url, {});
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Action failed')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <ActionButtons>
      <button
        type="button"
        disabled={s.busy}
        onClick={go}
        className={isSuspended ? 'rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50' : 'rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50'}
      >
        {isSuspended ? 'Reactivate business' : 'Suspend business'}
      </button>
      <ErrorNote message={s.error} />
    </ActionButtons>
  );
}

// ── Plans ──────────────────────────────────────────────────────────────────

export function PlanCreateForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const s = useActionState();
  const [f, setF] = useState({
    name: '', displayName: '', description: '', monthlyPriceNaira: '0', annualPriceNaira: '0',
    productLimit: '10', staffLimit: '2', customDomain: false, analyticsTier: 'basic', sortOrder: '10',
  });
  async function submit(e: FormEvent) {
    e.preventDefault(); s.setBusy(true); s.setError(null); s.setNotice(null);
    try {
      const r = await postJson('/api/admin/subscriptions/plans', {
        name: f.name, displayName: f.displayName, description: f.description,
        monthlyPriceNaira: Number(f.monthlyPriceNaira), annualPriceNaira: Number(f.annualPriceNaira),
        productLimit: Number(f.productLimit), staffLimit: Number(f.staffLimit),
        customDomain: f.customDomain, analyticsTier: f.analyticsTier, sortOrder: Number(f.sortOrder),
      });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not create plan')); return; }
      s.setNotice('Plan created');
      setF({ ...f, name: '', displayName: '', description: '' });
      router.refresh();
      onDone?.();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const input = 'rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label}>Plan key (lowercase slug)</label>
        <input required className={`mt-1 w-full ${input}`} value={f.name} placeholder="pro-500k"
          onChange={(e) => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label className={label}>Display name</label>
        <input required className={`mt-1 w-full ${input}`} value={f.displayName} placeholder="Pro 500k"
          onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Description</label>
        <input className={`mt-1 w-full ${input}`} value={f.description} placeholder="For fast-growing sellers"
          onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
      <div>
        <label className={label}>Monthly price (₦)</label>
        <input required type="number" min="0" step="0.01" className={`mt-1 w-full ${input}`} value={f.monthlyPriceNaira}
          onChange={(e) => setF({ ...f, monthlyPriceNaira: e.target.value })} />
      </div>
      <div>
        <label className={label}>Annual price (₦)</label>
        <input required type="number" min="0" step="0.01" className={`mt-1 w-full ${input}`} value={f.annualPriceNaira}
          onChange={(e) => setF({ ...f, annualPriceNaira: e.target.value })} />
      </div>
      <div>
        <label className={label}>Product limit</label>
        <input required type="number" min="0" className={`mt-1 w-full ${input}`} value={f.productLimit}
          onChange={(e) => setF({ ...f, productLimit: e.target.value })} />
      </div>
      <div>
        <label className={label}>Staff limit</label>
        <input required type="number" min="1" className={`mt-1 w-full ${input}`} value={f.staffLimit}
          onChange={(e) => setF({ ...f, staffLimit: e.target.value })} />
      </div>
      <div>
        <label className={label}>Sort order</label>
        <input type="number" className={`mt-1 w-full ${input}`} value={f.sortOrder}
          onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
      </div>
      <div className="flex items-end gap-4 pb-1">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          <input type="checkbox" checked={f.customDomain} onChange={(e) => setF({ ...f, customDomain: e.target.checked })} />
          Custom domain
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          <select className={input} value={f.analyticsTier} onChange={(e) => setF({ ...f, analyticsTier: e.target.value })}>
            <option value="basic">Basic analytics</option>
            <option value="advanced">Advanced analytics</option>
          </select>
        </label>
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={s.busy} className={`${btnPrimary} bg-[var(--color-primary)]`}>Create plan</button>
        <ErrorNote message={s.error} />
        <NoticeNote message={s.notice} />
      </div>
    </form>
  );
}

export function PlanArchiveButton({ id, name, subscriberCount, disabled }: { id: string; name: string; subscriberCount: number; disabled: boolean }) {
  const router = useRouter();
  const s = useActionState();
  async function archive() {
    if (!confirm(`Archive the "${name}" plan? Existing subscribers keep it; it stops being offered.`)) return;
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('DELETE', `/api/admin/subscriptions/plans/${id}`);
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not archive plan')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={s.busy || disabled} onClick={archive} className={btnGhost}>
        {disabled ? `In use (${subscriberCount})` : 'Archive'}
      </button>
      <ErrorNote message={s.error} />
    </span>
  );
}

// ── Tickets ────────────────────────────────────────────────────────────────

export function TicketCreateForm() {
  const router = useRouter();
  const s = useActionState();
  const [f, setF] = useState({ subject: '', body: '', priority: 'normal', businessId: '' });
  async function submit(e: FormEvent) {
    e.preventDefault(); s.setBusy(true); s.setError(null); s.setNotice(null);
    try {
      const r = await postJson('/api/admin/tickets', {
        subject: f.subject, body: f.body, priority: f.priority,
        businessId: f.businessId.trim() || undefined,
      });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not file ticket')); return; }
      s.setNotice('Ticket filed');
      setF({ subject: '', body: '', priority: 'normal', businessId: '' });
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const input = 'w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';
  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <label className={label}>Subject</label>
        <input required className={`mt-1 ${input}`} value={f.subject}
          onChange={(e) => setF({ ...f, subject: e.target.value })} />
      </div>
      <div>
        <label className={label}>Body</label>
        <textarea required rows={3} className={`mt-1 ${input}`} value={f.body}
          onChange={(e) => setF({ ...f, body: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          Priority
          <select className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs" value={f.priority}
            onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
          Business id (optional)
          <input className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs" value={f.businessId}
            onChange={(e) => setF({ ...f, businessId: e.target.value })} />
        </label>
        <button type="submit" disabled={s.busy} className={`${btnPrimary} bg-[var(--color-primary)]`}>File ticket</button>
      </div>
      <ErrorNote message={s.error} />
      <NoticeNote message={s.notice} />
    </form>
  );
}

export function TicketActionRow({ id }: { id: string }) {
  const router = useRouter();
  const s = useActionState();
  async function apply(field: 'status' | 'priority' | 'assigneeUserId', value: string) {
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('PATCH', `/api/admin/tickets/${id}`, { [field]: value || null });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Update failed')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-3 text-xs">
      <select className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs" defaultValue="" onChange={(e) => e.target.value && apply('status', e.target.value)}>
        <option value="" disabled>Change status…</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
      <select className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs" defaultValue="" onChange={(e) => e.target.value && apply('priority', e.target.value)}>
        <option value="" disabled>Change priority…</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>
      <ErrorNote message={s.error} />
    </span>
  );
}

// ── Coupons ────────────────────────────────────────────────────────────────

export function CouponCreateForm() {
  const router = useRouter();
  const s = useActionState();
  const [f, setF] = useState({ code: '', kind: 'percentage', value: '', minOrderAmount: '', startsAt: '', expiresAt: '', maxUses: '' });
  async function submit(e: FormEvent) {
    e.preventDefault(); s.setBusy(true); s.setError(null); s.setNotice(null);
    try {
      const r = await postJson('/api/admin/coupons', {
        code: f.code, kind: f.kind, value: Number(f.value),
        minOrderAmount: f.minOrderAmount ? Number(f.minOrderAmount) : undefined,
        maxUses: f.maxUses ? Number(f.maxUses) : undefined,
        startsAt: f.startsAt || undefined, expiresAt: f.expiresAt || undefined,
      });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not create coupon')); return; }
      s.setNotice('Coupon created');
      setF({ code: '', kind: 'percentage', value: '', minOrderAmount: '', startsAt: '', expiresAt: '', maxUses: '' });
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const input = 'rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className={label}>Code</label>
        <input required className={`mt-1 w-full ${input}`} placeholder="WELCOME10" value={f.code}
          onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
      </div>
      <div>
        <label className={label}>Kind</label>
        <select className={`mt-1 w-full ${input}`} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="percentage">Percentage (%)</option>
          <option value="fixed">Fixed (₦)</option>
        </select>
      </div>
      <div>
        <label className={label}>Value</label>
        <input required type="number" min="0.01" step="0.01" className={`mt-1 w-full ${input}`} value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })} />
      </div>
      <div>
        <label className={label}>Min order (₦, optional)</label>
        <input type="number" min="0" className={`mt-1 w-full ${input}`} value={f.minOrderAmount}
          onChange={(e) => setF({ ...f, minOrderAmount: e.target.value })} />
      </div>
      <div>
        <label className={label}>Max uses (optional)</label>
        <input type="number" min="1" className={`mt-1 w-full ${input}`} value={f.maxUses}
          onChange={(e) => setF({ ...f, maxUses: e.target.value })} />
      </div>
      <div className="flex items-end gap-3">
        <label className="flex-1">
          <span className={label}>Expires</span>
          <input type="date" className={`mt-1 w-full ${input}`} value={f.expiresAt}
            onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
        </label>
        <button type="submit" disabled={s.busy} className={`${btnPrimary} bg-[var(--color-primary)]`}>Create</button>
      </div>
      <div className="sm:col-span-3">
        <ErrorNote message={s.error} />
        <NoticeNote message={s.notice} />
      </div>
    </form>
  );
}

export function CouponToggleChip({ id, code, isActive }: { id: string; code: string; isActive: boolean }) {
  const router = useRouter();
  const s = useActionState();
  async function toggle() {
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('PATCH', `/api/admin/coupons/${id}`, { isActive: !isActive });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Update failed')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={s.busy} onClick={toggle}
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
        {isActive ? 'Active' : 'Disabled'} · {code}
      </button>
      <ErrorNote message={s.error} />
    </span>
  );
}

// ── Platform admins ─────────────────────────────────────────────────────────

export function AdminGrantForm({ roles }: { roles: { id: string; name: string }[] }) {
  const router = useRouter();
  const s = useActionState();
  const [f, setF] = useState({ email: '', roleId: roles[0]?.id ?? '', firstName: '', lastName: '' });
  async function submit(e: FormEvent) {
    e.preventDefault(); s.setBusy(true); s.setError(null); s.setNotice(null);
    try {
      const r = await postJson('/api/admin/platform/admins', f);
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not grant admin access')); return; }
      const granted = r.data as { email?: string; roleName?: string } | null;
      s.setNotice(`${granted?.email} is now a platform admin (${granted?.roleName})`);
      setF({ email: '', roleId: f.roleId, firstName: '', lastName: '' });
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const input = 'rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label}>Email</label>
        <input required type="email" className={`mt-1 w-full ${input}`} value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div>
        <label className={label}>Role</label>
        <select className={`mt-1 w-full ${input}`} value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div>
        <label className={label}>First name (if creating the user)</label>
        <input className={`mt-1 w-full ${input}`} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
      </div>
      <div>
        <label className={label}>Last name (if creating the user)</label>
        <input className={`mt-1 w-full ${input}`} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" disabled={s.busy} className={`${btnPrimary} bg-[var(--color-primary)]`}>Grant admin access</button>
        <ErrorNote message={s.error} />
        <NoticeNote message={s.notice} />
      </div>
    </form>
  );
}

export function AdminRowActions({ id, isActive, userIsActive, self, lastSuper, roleOptions }: {
  id: string;
  isActive: boolean;
  userIsActive: boolean;
  self: boolean;
  lastSuper: boolean;
  roleOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const s = useActionState();
  async function update(body: Record<string, unknown>) {
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('PATCH', `/api/admin/platform/admins/${id}`, body);
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Update failed')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  async function remove() {
    if (!confirm('Remove this user from the platform admin team?')) return;
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('DELETE', `/api/admin/platform/admins/${id}`);
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not remove')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!self && (
        <button type="button" disabled={s.busy || (isActive && lastSuper)} onClick={() => update({ isActive: !isActive })}
          className={`rounded-md px-2 py-1 text-[10px] font-bold ${isActive ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isActive ? 'Deactivate' : 'Activate'}
        </button>
      )}
      {!self && (
        <button type="button" disabled={s.busy} onClick={remove} className="rounded-md bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">
          Remove
        </button>
      )}
      <select
        className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px]"
        defaultValue=""
        disabled={self}
        onChange={(e) => {
          const v = e.target.value;
          if (v && v !== 'self') update({ roleId: v });
        }}
      >
        <option value="" disabled>{self ? 'Your own role' : 'Change role…'}</option>
        {roleOptions.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      {!self && (
        <button type="button" disabled={s.busy} onClick={() => update({ userIsActive: !userIsActive })}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold text-[var(--color-text-muted)]">
          {userIsActive ? 'Disable login' : 'Enable login'}
        </button>
      )}
      <ErrorNote message={s.error} />
    </span>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────

export function SettingForm() {
  const router = useRouter();
  const s = useActionState();
  const [f, setF] = useState({ key: '', value: '', description: '' });
  async function submit(e: FormEvent) {
    e.preventDefault(); s.setBusy(true); s.setError(null); s.setNotice(null);
    let parsed: unknown;
    try { parsed = JSON.parse(f.value || 'null'); }
    catch { s.setError('value must be valid JSON (e.g. "true", "5", "{\\"a\\":1}")'); s.setBusy(false); return; }
    try {
      const r = await sendJson('PUT', '/api/admin/settings', { key: f.key, value: parsed, description: f.description || undefined });
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not save setting')); return; }
      s.setNotice(`Saved ${f.key}`);
      setF({ key: '', value: '', description: '' });
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const input = 'w-full rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]';
  const label = 'block text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';
  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Key</label>
          <input required className={`mt-1 ${input}`} placeholder="maintenance_mode" value={f.key}
            onChange={(e) => setF({ ...f, key: e.target.value })} />
        </div>
        <div>
          <label className={label}>Description (optional)</label>
          <input className={`mt-1 ${input}`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </div>
      </div>
      <div>
        <label className={label}>Value (JSON)</label>
        <input required className={`mt-1 ${input}`} placeholder="true" value={f.value}
          onChange={(e) => setF({ ...f, value: e.target.value })} />
      </div>
      <div>
        <button type="submit" disabled={s.busy} className={`${btnPrimary} bg-[var(--color-primary)]`}>Upsert setting</button>
        <ErrorNote message={s.error} />
        <NoticeNote message={s.notice} />
      </div>
    </form>
  );
}

export function SettingRow({ settingKey, value, updatedAt }: { settingKey: string; value: unknown; updatedAt: string }) {
  const router = useRouter();
  const s = useActionState();
  async function remove() {
    if (!confirm(`Delete setting "${settingKey}"?`)) return;
    s.setBusy(true); s.setError(null);
    try {
      const r = await sendJson('DELETE', `/api/admin/settings/${encodeURIComponent(settingKey)}`);
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not delete')); return; }
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--color-text)]">{settingKey}</p>
        <p className="truncate text-xs text-[var(--color-text-muted)]">
          {JSON.stringify(value)} · updated {new Date(updatedAt).toLocaleString()}
        </p>
      </div>
      <button type="button" onClick={remove} disabled={s.busy} className="rounded-md bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700 disabled:opacity-50">
        Delete
      </button>
      <span><ErrorNote message={s.error} /></span>
    </div>
  );
}

// ── Impersonation —─────────────────────────────────────────────────────────

export function EndImpersonationButton({ compact = true }: { compact?: boolean }) {
  const s = useActionState();
  async function end() {
    s.setBusy(true); s.setError(null);
    try {
      const r = await postJson('/api/admin/impersonate/end', {});
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not end impersonation')); return; }
      window.location.href = '/admin';
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={end}
        disabled={s.busy}
        className={compact
          ? 'rounded-md bg-white/90 px-3 py-1 text-[11px] font-bold text-red-700 shadow-sm disabled:opacity-50'
          : 'rounded-md bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50'}
      >
        End impersonation
      </button>
      <ErrorNote message={s.error} />
    </span>
  );
}

// ── Sign out —───────────────────────────────────────────────────────────────
// Shared by both the business dashboard sidebar (DashboardNav) and the platform
// admin sidebar (AdminNav): POSTs /api/auth/logout to clear the session cookies
// (and any Phase 10 impersonation cookie) then goes to the login page.

export function LogoutButton({ compact = false, className }: { compact?: boolean; className?: string }) {
  const router = useRouter();
  const s = useActionState();
  async function go() {
    s.setBusy(true); s.setError(null);
    try {
      const r = await postJson('/api/auth/logout', {});
      if (!r.ok) { s.setError(getApiMessage(r.data, 'Could not sign out')); return; }
      router.push('/login');
      router.refresh();
    } catch { s.setError('Network error'); } finally { s.setBusy(false); }
  }
  const cls = className ?? (compact
    ? 'rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50'
    : 'rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50');
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={s.busy}
        className={cls}
      >
        Sign out
      </button>
      <ErrorNote message={s.error} />
    </span>
  );
}