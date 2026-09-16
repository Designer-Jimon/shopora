const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$transaction(async (tx) => {
  const emails = ['onboard-test@shopora.dev','onboard-other@shopora.dev','incomplete@shopora.dev'];
  const users = await tx.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await tx.businessStaff.deleteMany({ where: { userId: { in: users.map(u=>u.id) } } });
  await tx.business.deleteMany({ where: { name: { in: ['Onboard Mart','Incomplete Co'] } } });
  return tx.user.deleteMany({ where: { email: { in: emails } } });
}).then((c)=>{ console.log('cleanup done, users deleted:', c.count); return p.$disconnect(); })
  .catch((e)=>{ console.error(e.message); return p.$disconnect(); });
