// SHOPORA super admin bootstrap — the ONLY supported way to create the first
// platform administrator. There is intentionally no self-registration path for
// this role (see /api/auth/register — it cannot create platform admins).
//
// Usage:
//   npm run db:seed-admin -- --email=admin@shopora.dev
//   npm run db:seed-admin -- --email=a@b.c --password=StrongPass123!
// Env fallbacks: SHOPORA_ADMIN_EMAIL, SHOPORA_ADMIN_PASSWORD.
//
// Idempotent: re-running upgrades the existing user's platform membership to
// 'Platform Super Admin'. If the platform roles/permissions have not been
// seeded yet, run `npm run db:seed` first (this script also seeds them on its
// own if missing, so a fresh DB just needs db:migrate + this script).
//
// SAFETY GUARD: this script never silently overlaps a Super Admin identity
// onto an existing business account. If the --email already exists as a User
// AND has any BusinessStaff row (i.e. is or was a business owner/staff member
// on any business), the script REFUSES with a clear error and exits without
// upgrading anything. A Super Admin must be a brand-new user, or an existing
// user with NO business associations at all (e.g. registered but never
// onboarded). Use a different email for the Super Admin account.

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth/password';
import { ensurePlansSeeded } from '../src/lib/subscriptions/plans';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : undefined;
}

function parseBoolean(v: string | undefined): boolean {
  return v === 'true' || v === '1' || v === 'yes';
}

async function main() {
  const email = (arg('--email') || process.env.SHOPORA_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = arg('--password') || process.env.SHOPORA_ADMIN_PASSWORD || '';
  const firstName = (arg('--firstName') || process.env.SHOPORA_ADMIN_FIRST_NAME || 'Platform').trim();
  const lastName = (arg('--lastName') || process.env.SHOPORA_ADMIN_LAST_NAME || 'Admin').trim();
  const allowExistingPassword = parseBoolean(arg('--allow-existing-password') || process.env.SHOPORA_ADMIN_ALLOW_EXISTING_PASSWORD);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('ERROR: a valid email is required (--email=you@shopora.dev or SHOPORA_ADMIN_EMAIL).');
    process.exit(1);
  }
  if (!allowExistingPassword && password.length < 8) {
    console.error('ERROR: password must be at least 8 characters (--password=… or SHOPORA_ADMIN_PASSWORD).');
    process.exit(1);
  }

  // ── Safety guard: no silent overlap onto a business account ──────────────
  // Runs BEFORE any user create/upgrade. If this email already exists as a
  // User AND holds a BusinessStaff row (owner/staff on ANY business, active or
  // former), refuse — a Super Admin identity must never be grafted onto a
  // business account. Fail fast: nothing is seeded or written when we refuse.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const businessRow = await prisma.businessStaff.findFirst({
      where: { userId: existingUser.id },
      include: { business: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (businessRow) {
      console.error(
        `ERROR: this email is already associated with a business account (${businessRow.business.name}). Use a different email for the Super Admin account.`,
      );
      process.exit(1);
    }
  }

  // Platform roles come from the Phase 2 seed; ensure they exist (idempotent).
  const { SEED_PERMISSIONS, SEED_ROLES } = await import('../src/lib/auth/permissions');
  const permRecords: Record<string, { id: string }> = {};
  for (const perm of SEED_PERMISSIONS) {
    const rec = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, category: perm.category },
      create: { name: perm.name, description: perm.description, category: perm.category },
    });
    permRecords[perm.name] = { id: rec.id };
  }
  const platformRoleDef = SEED_ROLES.find((r) => r.name === 'Platform Super Admin');
  if (!platformRoleDef) {
    console.error('ERROR: Platform Super Admin role definition missing from SEED_ROLES.');
    process.exit(1);
  }
  const role = await prisma.role.upsert({
    where: { name: platformRoleDef.name },
    update: { description: platformRoleDef.description, isSystem: true },
    create: { name: platformRoleDef.name, description: platformRoleDef.description, isSystem: true },
  });
  for (const pName of platformRoleDef.permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permRecords[pName].id } },
      update: {},
      create: { roleId: role.id, permissionId: permRecords[pName].id },
    });
  }

  // Plans are needed for a real dashboard; ensure the catalogue exists too.
  await ensurePlansSeeded();

  // ── User ──────────────────────────────────────────────────────────
  let userId: string;
  let tempPassword: string | null = null;

  if (existingUser) {
    userId = existingUser.id;
    if (password) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash: await hashPassword(password) },
      });
      console.log(`  → updated password for existing user ${email}`);
    } else if (allowExistingPassword) {
      console.log('  → keeping existing password (--allow-existing-password)');
    }
    if (!existingUser.isActive) {
      await prisma.user.update({ where: { id: existingUser.id }, data: { isActive: true } });
    }
  } else {
    if (!password) {
      tempPassword = `Shopora!${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
    const created = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        passwordHash: await hashPassword(tempPassword ?? password),
      },
      select: { id: true },
    });
    userId = created.id;
  }

  // ── Platform membership ───────────────────────────────────────────
  await prisma.platformStaff.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: { isActive: true },
    create: { userId, roleId: role.id, isActive: true },
  });

  console.log(`Platform Super Admin ready: ${email} (role: ${role.name})`);
  if (tempPassword) {
    console.log(`Temporary password (change on first login): ${tempPassword}`);
  }
}

main()
  .catch((e) => {
    console.error('Bootstrap failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });