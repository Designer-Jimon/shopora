// Server component: renders a section's landing page with only the child
// routes the current role is allowed to see (mirrors the sidebar filter).

import { requireDashboardAccess } from '@/lib/dashboard';
import { buildDashboardNav } from '@/lib/dashboard-nav';
import PageStub from './PageStub';

export default async function SectionLanding({ sectionPath }: { sectionPath: string }) {
  const access = await requireDashboardAccess();
  const nav = buildDashboardNav(access.businessRole, access.permissions);
  const section = nav.find((s) => s.href === sectionPath);
  if (!section) return null;

  return (
    <PageStub
      title={section.label}
      description={section.description}
      links={section.children.map((c) => ({
        label: c.label,
        href: c.href,
        description: c.description,
      }))}
    />
  );
}