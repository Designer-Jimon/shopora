// SHOPORA seed — creates system roles and permissions.
// Idempotent: re-runnable on an existing database (upserts by name).
// Run via: npm run db:seed

import { PrismaClient, Prisma } from '@prisma/client';
import { SEED_PERMISSIONS, SEED_ROLES } from '../src/lib/auth/permissions';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions...');

  const permissionRecords: Record<string, { id: string }> = {};

  for (const perm of SEED_PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, category: perm.category },
      create: {
        name: perm.name,
        description: perm.description,
        category: perm.category,
      },
    });
    permissionRecords[perm.name] = { id: record.id };
  }

  console.log(`  → ${Object.keys(permissionRecords).length} permissions`);

  console.log('Seeding roles...');

  for (const seedRole of SEED_ROLES) {
    // Upsert the role
    const role = await prisma.role.upsert({
      where: { name: seedRole.name },
      update: {
        description: seedRole.description,
        isSystem: seedRole.isSystem,
      },
      create: {
        name: seedRole.name,
        description: seedRole.description,
        isSystem: seedRole.isSystem,
      },
    });

    // Sync role ↔ permissions: remove stale, add missing (idempotent)
    // First: get existing permission IDs for this role
    const existingRps = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingPermIds = new Set(existingRps.map((r) => r.permissionId));

    // Target permission IDs
    const targetPermIds = seedRole.permissions.map(
      (pName) => permissionRecords[pName].id,
    );
    const targetPermIdSet = new Set(targetPermIds);

    // Remove stale (permissions no longer in the seed list for this role)
    for (const rp of existingRps) {
      if (!targetPermIdSet.has(rp.permissionId)) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: rp.permissionId },
        });
      }
    }

    // Add missing
    const toAdd = targetPermIds.filter((pid) => !existingPermIds.has(pid));
    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((pid) => ({ roleId: role.id, permissionId: pid })),
        skipDuplicates: true,
      });
    }

    console.log(
      `  → Role "${role.name}" synced: ${targetPermIds.length} permissions`,
    );
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
