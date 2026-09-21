// SHOPORA permissions — role/permission seed data for the platform.
// Owner = full access; Staff = baseline read + limited write.
// Product/order/etc. permissions are listed here for completeness (Phase 3+);
// Seed creates them now so roles are ready when those features land.

export type SeedPermission = {
  name: string;
  description: string;
  category: string;
};

export const SEED_PERMISSIONS: SeedPermission[] = [
  // ── Products ──────────────────────────────────────────────────────
  { name: 'products.read',   description: 'View products',            category: 'products' },
  { name: 'products.write',  description: 'Create and edit products', category: 'products' },
  { name: 'products.delete', description: 'Delete products',          category: 'products' },

  // ── Orders ────────────────────────────────────────────────────────
  { name: 'orders.read',     description: 'View orders',              category: 'orders' },
  { name: 'orders.write',    description: 'Update order status',      category: 'orders' },

  // ── Transactions ──────────────────────────────────────────────────
  { name: 'transactions.read',  description: 'View transactions',     category: 'transactions' },

  // ── Payments ──────────────────────────────────────────────────────
  // Note: not granted to Staff in the seed — payment gateway keys are
  // business-owner-level; the dashboard hides Payments behind the Owner-only
  // `payments.manage` gate from Phase 4.
  { name: 'payments.manage',    description: 'Connect and manage payment gateways', category: 'payments' },

  // ── Customers ─────────────────────────────────────────────────────
  { name: 'customers.read',   description: 'View customers',          category: 'customers' },
  { name: 'customers.write',  description: 'Edit customer details',   category: 'customers' },

  // ── Staff ─────────────────────────────────────────────────────────
  { name: 'staff.manage',     description: 'Invite/remove staff, assign roles', category: 'staff' },

  // ── Settings ──────────────────────────────────────────────────────
  { name: 'settings.read',    description: 'View business settings',  category: 'settings' },
  { name: 'settings.write',   description: 'Update business settings', category: 'settings' },

  // ── Subscription ──────────────────────────────────────────────────
  // Owner-only billing: plan/state visibility + checkout/activation.
  // Not granted to Staff in the seed (matches the Owner-only dashboard gate).
  { name: 'subscription.manage', description: 'View and manage the business subscription', category: 'subscription' },

  // ── Platform (Phase 10) ───────────────────────────────────────────
  // Super Admin permissions. Held by platform roles only (PlatformStaff rows);
  // never granted to a business Owner/Staff. `platform.access` is the base
  // gate for the /admin route group.
  { name: 'platform.access',           description: 'Reach the Super Admin dashboard',                 category: 'platform' },
  { name: 'platform.dashboard',        description: 'View platform-wide metrics',                      category: 'platform' },
  { name: 'platform.subscribers.read', description: 'View all businesses on the platform',             category: 'platform' },
  { name: 'platform.business.manage',  description: 'Suspend/reactivate businesses',                   category: 'platform' },
  { name: 'platform.impersonate',      description: 'Log in as a business (audited)',                  category: 'platform' },
  { name: 'platform.plans.manage',     description: 'Create and edit subscription plans',              category: 'platform' },
  { name: 'platform.revenue.read',     description: 'View subscription revenue analytics',             category: 'platform' },
  { name: 'platform.tickets.manage',   description: 'Manage support tickets',                          category: 'platform' },
  { name: 'platform.coupons.manage',   description: 'Manage platform coupons',                         category: 'platform' },
  { name: 'platform.settings.manage',  description: 'Manage platform settings',                        category: 'platform' },
  { name: 'platform.audit.read',       description: 'View the platform audit log',                     category: 'platform' },
  { name: 'platform.admins.manage',    description: 'Manage platform admin accounts',                  category: 'platform' },
];

export const PLATFORM_PERMISSIONS: SeedPermission[] = SEED_PERMISSIONS.filter(
  (p) => p.category === 'platform',
);

/** Business-scoped permissions (Owner/Staff roles). Platform perms are NEVER
 * granted through a business role — they only ever come from a PlatformStaff
 * membership, so a business Owner can never inherit admin access. */
export const BUSINESS_PERMISSIONS: SeedPermission[] = SEED_PERMISSIONS.filter(
  (p) => p.category !== 'platform',
);

export const SEED_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to everything in this business',
    isSystem: true,
    // Owner gets every business permission (never platform.* — see above)
    permissions: BUSINESS_PERMISSIONS.map((p) => p.name),
  },
  {
    name: 'Staff',
    description: 'Baseline access for team members',
    isSystem: true,
    permissions: [
      'products.read', 'products.write',
      'orders.read',   'orders.write',
      'transactions.read',
      'customers.read', 'customers.write',
      'settings.read',
    ],
  },
  // ── Platform roles (Phase 10) — global, gated via PlatformStaff ──
  // Platform Super Admin = unrestricted platform access.
  // Platform Admin = scoped staff: read + tickets only; explicitly NOT
  // impersonate / plan-write / coupon / setting / platform-admin management.
  {
    name: 'Platform Super Admin',
    description: 'Unrestricted access to the Super Admin dashboard',
    isSystem: true,
    permissions: PLATFORM_PERMISSIONS.map((p) => p.name),
  },
  {
    name: 'Platform Admin',
    description: 'Scoped platform staff: dashboards, subscribers, revenue and support tickets',
    isSystem: true,
    permissions: [
      'platform.access',
      'platform.dashboard',
      'platform.subscribers.read',
      'platform.revenue.read',
      'platform.audit.read',
      'platform.tickets.manage',
    ],
  },
] as const;
