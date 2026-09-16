import type { ReactNode } from 'react';
import DashboardNav from './_components/DashboardNav';
import { requireDashboardAccess } from '@/lib/dashboard';
import { buildDashboardNav } from '@/lib/dashboard-nav';

/**
 * Dashboard route-group shell (business owners & staff).
 *
 * Phase 4 guard: only an authenticated `business_user` whose business has
 * completed onboarding (onboardingStep === 99) may be here. Mid-onboarding
 * businesses are sent to /setup; customers/platform users are sent away;
 * unauthenticated visitors to /login.
 *
 * Navigation is permission-filtered (UI-level only) via buildDashboardNav.
 */

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const access = await requireDashboardAccess();

  const nav = buildDashboardNav(access.businessRole, access.permissions);
  const displayName = `${access.firstName} ${access.lastName}`;
  const userInitials = `${access.firstName[0] ?? ''}${access.lastName[0] ?? ''}`.toUpperCase();

  return (
    <DashboardNav
      nav={nav}
      businessName={access.businessName}
      businessSlug={access.businessSlug}
      businessRole={access.businessRole}
      displayName={displayName}
      userInitials={userInitials}
    >
      {children}
    </DashboardNav>
  );
}