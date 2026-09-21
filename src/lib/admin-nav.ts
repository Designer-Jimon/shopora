// SHOPORA platform admin navigation — sections + UI-level permission gates for
// the /admin route group. UI-level filtering only; authorization is enforced
// server-side by resolveAdminAccess / withAdminHandler.

export type AdminNavSection = {
  label: string;
  href: string;
  permission: string;
  children: { label: string; href: string; permission: string }[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    label: 'Overview',
    href: '/admin',
    permission: 'platform.dashboard',
    children: [],
  },
  {
    label: 'Subscribers',
    href: '/admin/subscribers',
    permission: 'platform.subscribers.read',
    children: [],
  },
  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    permission: 'platform.revenue.read',
    children: [
      {
        label: 'All subscriptions',
        href: '/admin/subscriptions',
        permission: 'platform.revenue.read',
      },
      {
        label: 'Plans',
        href: '/admin/subscriptions/plans',
        permission: 'platform.plans.manage',
      },
    ],
  },
  {
    label: 'Support',
    href: '/admin/tickets',
    permission: 'platform.tickets.manage',
    children: [],
  },
  {
    label: 'Coupons',
    href: '/admin/coupons',
    permission: 'platform.coupons.manage',
    children: [],
  },
  {
    label: 'Platform',
    href: '/admin/platform/admins',
    permission: 'platform.admins.manage',
    children: [],
  },
  {
    label: 'Audit log',
    href: '/admin/audit-logs',
    permission: 'platform.audit.read',
    children: [],
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    permission: 'platform.settings.manage',
    children: [],
  },
];

export function buildAdminNav(permissions: string[]): AdminNavSection[] {
  const allowed = new Set(permissions);
  return ADMIN_NAV.map((section) => {
    const visibleChildren = section.children.filter((c) => allowed.has(c.permission));
    if (!allowed.has(section.permission)) return null;
    return { ...section, children: visibleChildren };
  }).filter((s): s is AdminNavSection => s !== null);
}