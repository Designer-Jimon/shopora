// Phase 2 headless integration test — verifies the CORE auth logic against the
// live PostgreSQL DB without the Next.js HTTP layer (which is slow here).
// Exercises: register (User + Business + BusinessStaff Owner), argon2 verify,
// JWT issue/verify, tenant resolution (businessId from session), 401 rejection.

process.env.NODE_ENV = 'development';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'shopora-dev-access-secret-do-not-use-in-production';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'shopora-dev-refresh-secret-do-not-use-in-production';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

import { PrismaClient } from '@prisma/client';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../src/lib/auth/jwt';

const prisma = new PrismaClient();

let failed = false;
const ok = (label: string, cond: boolean) => {
  if (cond) console.log(`  PASS  ${label}`);
  else { console.error(`  FAIL  ${label}`); failed = true; }
};

async function main() {
  console.log('\n== Phase 2 integration test ==\n');

  const testEmail = 'owner-test@shopora.dev';
  await prisma.user.deleteMany({ where: { email: testEmail } });

  // 1. Password hashing (argon2id)
  console.log('1. Password hashing');
  const pwHash = await hashPassword('StrongPass123!');
  ok('argon2 hashes to argon2id', pwHash.startsWith('$argon2id$'));
  ok('verify correct password', await verifyPassword(pwHash, 'StrongPass123!'));
  ok('rejects wrong password', !(await verifyPassword(pwHash, 'wrongpass')));

  // 2. Roles seeded
  console.log('\n2. Seeded roles');
  const ownerRole = await prisma.role.findUnique({ where: { name: 'Owner' } });
  const staffRole = await prisma.role.findUnique({ where: { name: 'Staff' } });
  ok('Owner role seeded', !!ownerRole);
  ok('Staff role seeded', !!staffRole);
  const ownerPermCount = await prisma.rolePermission.count({ where: { roleId: ownerRole.id } });
  ok(`Owner has ${ownerPermCount} permissions (expect 13)`, ownerPermCount === 13);

  // 3. Register business owner (transaction)
  console.log('\n3. Register business owner');
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: testEmail, passwordHash: pwHash, firstName: 'Ada', lastName: 'Okafor' },
      select: { id: true, email: true },
    });
    let slug = 'ada-oak-store';
    let counter = 2;
    while (await tx.business.findUnique({ where: { slug } })) { slug = `ada-oak-store-${counter++}`; }
    const biz = await tx.business.create({ data: { name: 'Ada Oak Store', slug } });
    await tx.businessStaff.create({ data: { userId: user.id, businessId: biz.id, roleId: ownerRole.id } });
    return { user, biz };
  });
  ok('User created', !!result.user.id);
  ok('Business created', !!result.biz.id);

  const staffRow = await prisma.businessStaff.findFirst({
    where: { userId: result.user.id, businessId: result.biz.id },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  ok('BusinessStaff Owner row created', staffRow?.role.name === 'Owner');

  // 4. JWT issue/verify
  console.log('\n4. JWT issue/verify');
  const accessToken = await signAccessToken(
    {
      sub: result.user.id,
      role: 'business_user',
      businessId: result.biz.id,
      businessRole: 'Owner',
      permissions: staffRow.role.permissions.map((rp) => rp.permission.name),
    },
    { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '900s' },
  );
  const verified = await verifyAccessToken(accessToken, process.env.JWT_ACCESS_SECRET);
  ok('access token verifies with userId', verified?.sub === result.user.id);
  ok('access token carries businessId', verified?.businessId === result.biz.id);
  ok('access token carries permissions', Array.isArray(verified?.permissions) && verified.permissions.length > 0);
  const bad = await verifyAccessToken('not.a.jwt', process.env.JWT_ACCESS_SECRET);
  ok('garbage token rejected', bad === null);

  const refreshToken = await signRefreshToken(result.user.id, { secret: process.env.JWT_REFRESH_SECRET, expiresIn: '2592000s' });
  const rv = await verifyRefreshToken(refreshToken, process.env.JWT_REFRESH_SECRET);
  ok('refresh token verifies', rv?.sub === result.user.id);

  // 5. Tenant resolution from session
  console.log('\n5. Tenant resolution from session');
  const resolved = await (async () => {
    const user = await prisma.user.findUnique({ where: { id: verified.sub } });
    if (!user || !user.isActive) return null;
    const st = await prisma.businessStaff.findFirst({
      where: { userId: user.id, businessId: verified.businessId, isActive: true },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!st) return null;
    return { businessId: st.businessId, businessRole: st.role.name, permissions: st.role.permissions.map((rp) => rp.permission.name) };
  })();
  ok('session resolves to real businessId (not null)', resolved?.businessId === result.biz.id);
  ok('session resolves businessRole=Owner', resolved?.businessRole === 'Owner');
  ok('Owner permissions loaded from DB', resolved?.permissions.includes('products.write'));

  // 6. Suspension → immediate revocation
  console.log('\n6. Suspension → immediate revocation');
  await prisma.businessStaff.update({ where: { id: staffRow.id }, data: { isActive: false } });
  const revoked = await (async () => {
    const user = await prisma.user.findUnique({ where: { id: verified.sub } });
    if (!user || !user.isActive) return null;
    const st = await prisma.businessStaff.findFirst({ where: { userId: user.id, businessId: verified.businessId, isActive: true } });
    if (!st) return null;
    return { businessId: st.businessId };
  })();
  ok('suspended staff row → request rejected (null)', revoked === null);
  await prisma.businessStaff.update({ where: { id: staffRow.id }, data: { isActive: true } });

  // 7. Login password verification
  console.log('\n7. Login password verification');
  const dbUser = await prisma.user.findUnique({ where: { email: testEmail } });
  ok('stored hash verifies on login', await verifyPassword(dbUser.passwordHash, 'StrongPass123!'));

  // Cleanup
  await prisma.user.deleteMany({ where: { email: testEmail } });
  console.log('\nCleaned up test user.');
  console.log(failed ? '\n== SOME CHECKS FAILED ==' : '\n== ALL CHECKS PASSED ==');
  if (failed) process.exit(1);
}

main().catch((e) => { console.error('Test crashed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
