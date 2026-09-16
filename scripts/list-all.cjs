const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$transaction(async (tx) => {
  const [users, biz, roles, perms] = await Promise.all([
    tx.user.findMany({ select: { email: true } }),
    tx.business.findMany({ select: { name: true, slug: true, onboardingStep: true } }),
    tx.role.findMany({ select: { name: true } }),
    tx.permission.count(),
  ]);
  console.log(JSON.stringify({ users, businesses: biz, roles, permissionCount: perms }, null, 2));
}).then(() => p.$disconnect()).catch(e => { console.error(e.message); return p.$disconnect(); });
