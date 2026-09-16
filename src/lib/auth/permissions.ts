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

  // ── Customers ─────────────────────────────────────────────────────
  { name: 'customers.read',   description: 'View customers',          category: 'customers' },
  { name: 'customers.write',  description: 'Edit customer details',   category: 'customers' },

  // ── Staff ─────────────────────────────────────────────────────────
  { name: 'staff.manage',     description: 'Invite/remove staff, assign roles', category: 'staff' },

  // ── Settings ──────────────────────────────────────────────────────
  { name: 'settings.read',    description: 'View business settings',  category: 'settings' },
  { name: 'settings.write',   description: 'Update business settings', category: 'settings' },
];

export const SEED_ROLES = [
  {
    name: 'Owner',
    description: 'Full access to everything in this business',
    isSystem: true,
    // Owner gets every permission
    permissions: SEED_PERMISSIONS.map((p) => p.name),
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
] as const;
