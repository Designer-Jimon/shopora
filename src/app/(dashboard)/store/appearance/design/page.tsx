import { requireDashboardAccess } from '@/lib/dashboard';
import prisma from '@/lib/prisma';
import { serializeDesign } from '@/lib/storefront-design/serialize';
import DesignEditor from '../_components/DesignEditor';

export const dynamic = 'force-dynamic';

export default async function DesignEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; template?: string }>;
}) {
  const sp = await searchParams;
  const access = await requireDashboardAccess();

  if (!access.permissions.includes('settings.read')) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="max-w-sm text-center text-sm text-[var(--color-text-muted)]">
          You don&apos;t have permission to access the Design Studio.
        </p>
      </div>
    );
  }

  let design = null;
  let templateId: string | null = sp.template ?? null;

  if (sp.id) {
    const row = await prisma.storefrontDesign.findFirst({
      where: { id: sp.id, businessId: access.businessId },
    });
    if (row) {
      design = serializeDesign(row);
      templateId = null;
    }
  }

  return (
    <DesignEditor
      design={design}
      templateId={templateId}
      previewUrl={`/${access.businessSlug}?preview=1`}
    />
  );
}