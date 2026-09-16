const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
// Clean all test users/businesses created by the HTTP E2E test.
p.$transaction(async (tx) => {
  const emails = ['http-owner-test@shopora.dev'];
  await tx.businessStaff.deleteMany({ where: { userId: { in: (await tx.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(u => u.id) } } });
  await tx.business.deleteMany({ where: { name: 'HTTP Test Biz' } });
  const del = await tx.user.deleteMany({ where: { email: { in: emails } } });
  return del.count;
}).then((c) => {
  console.log('deleted test users:', c);
  return p.$transaction(async (tx) => {
    const [u, b] = await Promise.all([tx.user.count(), tx.business.count()]);
    return { users: u, businesses: b };
  });
}).then((r) => { console.log('post-cleanup:', JSON.stringify(r)); return p.$disconnect(); })
  .catch((e) => { console.error(e.message); return p.$disconnect(); });
