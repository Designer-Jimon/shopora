// SHOPORA dashboard navigation — sections, routes, and UI-level permission
// gates for the business admin shell.
//
// ⚠️  This is UI-level NAVIGATION FILTERING ONLY. It controls which links are
// shown/hidden in the sidebar. Real authorization is enforced server-side per
// route/API as features are built (requireAuth / requirePermission in
// src/lib/tenant.ts). Never treat visibility here as a security boundary.
//
// Permission gates reference seeded permissions (src/lib/auth/permissions.ts).
// Sections that have no seeded permission yet (marketing / payments /
// subscription) use forward-looking permission names; until those are seeded,
// Staff never holds them, so those sections are Owner-only.

export type DashboardNavItem = {
  label: string;
  href: string;
  description: string;
  /** Permission required for non-Owner roles to see this item. */
  permission?: string;
};

export type DashboardNavSection = {
  label: string;
  href: string;
  description: string;
  /** Permission required for non-Owner roles to see this section. */
  permission?: string;
  children: DashboardNavItem[];
};

export const DASHBOARD_NAV: DashboardNavSection[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    description: 'Store overview and key metrics',
    children: [],
  },
  {
    label: 'Products',
    href: '/products',
    description: 'Manage your catalogue',
    permission: 'products.read',
    children: [
      {
        label: 'All Products',
        href: '/products/all',
        description: 'Browse and manage every product',
        permission: 'products.read',
      },
      {
        label: 'Add Product',
        href: '/products/add',
        description: 'Create a new product',
        permission: 'products.write',
      },
      {
        label: 'Categories',
        href: '/products/categories',
        description: 'Organise products into categories',
        permission: 'products.read',
      },
      {
        label: 'Inventory',
        href: '/products/inventory',
        description: 'Stock levels and variants',
        permission: 'products.read',
      },
    ],
  },
  {
    label: 'Sales',
    href: '/sales',
    description: 'Orders, customers, transactions',
    permission: 'orders.read',
    children: [
      {
        label: 'Orders',
        href: '/sales/orders',
        description: 'Fulfil and track orders',
        permission: 'orders.read',
      },
      {
        label: 'Customers',
        href: '/sales/customers',
        description: 'Your customer directory',
        permission: 'customers.read',
      },
      {
        label: 'Transactions',
        href: '/sales/transactions',
        description: 'Payment and payout history',
        permission: 'transactions.read',
      },
    ],
  },
  {
    label: 'Marketing',
    href: '/marketing',
    description: 'Discounts, coupons, promotions',
    permission: 'marketing.manage',
    children: [
      {
        label: 'Discounts',
        href: '/marketing/discounts',
        description: 'Create and manage discounts',
        permission: 'marketing.manage',
      },
      {
        label: 'Coupons',
        href: '/marketing/coupons',
        description: 'Issue coupon codes',
        permission: 'marketing.manage',
      },
      {
        label: 'Promotions',
        href: '/marketing/promotions',
        description: 'Run promotional campaigns',
        permission: 'marketing.manage',
      },
    ],
  },
  {
    label: 'Store',
    href: '/store',
    description: 'Store settings and appearance',
    permission: 'settings.read',
    children: [
      {
        label: 'Store Settings',
        href: '/store/settings',
        description: 'Business details and contact info',
        permission: 'settings.read',
      },
      {
        label: 'Appearance',
        href: '/store/appearance',
        description: 'Theme, logo and banner',
        permission: 'settings.read',
      },
      {
        label: 'Domain',
        href: '/store/domain',
        description: 'Custom domains and store URL',
        permission: 'settings.write',
      },
    ],
  },
  {
    label: 'Payments',
    href: '/payments',
    description: 'Payments, providers and POS',
    permission: 'payments.manage',
    children: [
      {
        label: 'Payment Providers',
        href: '/payments/providers',
        description: 'Connect payment gateways',
        permission: 'payments.manage',
      },
      {
        label: 'Paystack',
        href: '/payments/paystack',
        description: 'Paystack settings',
        permission: 'payments.manage',
      },
      {
        label: 'Transactions',
        href: '/payments/transactions',
        description: 'Payment transaction history',
        permission: 'transactions.read',
      },
      {
        label: 'POS',
        href: '/payments/pos',
        description: 'Point-of-sale devices',
        permission: 'payments.manage',
      },
    ],
  },
  {
    label: 'Subscription',
    href: '/subscription',
    description: 'Plans and billing',
    permission: 'subscription.manage',
    children: [],
  },
  {
    label: 'Settings',
    href: '/settings',
    description: 'Workspace and team settings',
    permission: 'settings.read',
    children: [],
  },
];

const isOwner = (businessRole: string | undefined): boolean =>
  businessRole === 'Owner';

function canSee(item: { permission?: string }, allowed: Set<string>): boolean {
  if (!item.permission) return true;
  return allowed.has(item.permission);
}

/**
 * Filter the full nav for a given business role + permission set (UI-level).
 * Owners always see everything; other roles see only gated items they hold.
 */
export function buildDashboardNav(
  businessRole: string | undefined,
  permissions: string[],
): DashboardNavSection[] {
  if (isOwner(businessRole)) return DASHBOARD_NAV;

  const allowed = new Set(permissions);
  return DASHBOARD_NAV
    .map((section) => {
      const visibleChildren = section.children.filter((child) =>
        canSee(child, allowed),
      );
      if (!canSee(section, allowed)) return null;
      return { ...section, children: visibleChildren };
    })
    .filter((s): s is DashboardNavSection => s !== null);
}