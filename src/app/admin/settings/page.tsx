import { requireAdminAccess } from '@/lib/admin';
import prisma from '@/lib/prisma';
import { SettingForm, SettingRow } from '../_components/actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAdminAccess();

  const settings = await prisma.platformSetting.findMany({ orderBy: { key: 'asc' } });

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Platform settings</h1>
        <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
          Key/value configuration stored as JSON. Every change is audited.
        </p>
      </div>

      {settings.length > 0 && (
        <div className="mt-6 space-y-2">
          {settings.map((s) => (
            <SettingRow key={s.id} settingKey={s.key} value={s.value} updatedAt={s.updatedAt.toISOString()} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="text-sm font-bold text-[var(--color-text)]">Upsert a setting</h2>
        <div className="mt-4">
          <SettingForm />
        </div>
      </div>
    </div>
  );
}