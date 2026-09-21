import type { ReactNode } from 'react';
import AdminNav from './_components/AdminNav';
import { requireAdminAccess } from '@/lib/admin';
import { buildAdminNav } from '@/lib/admin-nav';

/**
 * Super Admin route-group shell (`/admin/...`). Authoritative access check is
 * resolveAdminAccess — only an active PlatformStaff membership with the
 * `platform.access` permission may render anything here; everyone else is
 * redirected to /login or /. Navigation below is UI-level filtering only.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await requireAdminAccess();

  const nav = buildAdminNav(access.permissions);
  const displayName = access.firstName ? `${access.firstName} ${access.lastName}`.trim() : access.roleName;
  const initials = access.firstName?.[0] ?? access.roleName[0] ?? 'A';
  const userInitials = `${initials}${access.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <AdminNav nav={nav} displayName={displayName} roleName={access.roleName} userInitials={userInitials}>
      {children}
    </AdminNav>
  );
}