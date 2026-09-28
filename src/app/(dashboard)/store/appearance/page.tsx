import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import { serializeDesign } from '@/lib/storefront-design/serialize';
import DesignStudioHome from './_components/DesignStudioHome';

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const access = await requireDashboardAccess();

  if (!access.permissions.includes('settings.read')) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Design Studio</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">
          You don&apos;t have permission to view this store&apos;s designs.
        </p>
      </div>
    );
  }

  const rows = await prisma.storefrontDesign.findMany({
    where: { businessId: access.businessId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return (
    <DesignStudioHome
      designs={rows.map(serializeDesign)}
      canWrite={access.permissions.includes('settings.write')}
      businessSlug={access.businessSlug}
    />
  );
}