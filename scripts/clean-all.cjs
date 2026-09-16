const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
// Delete ALL non-seed data. Seed = Role (Owner/Staff) + Permission + RolePermission.
p.$transaction(async (tx) => {
  const staffDel = await tx.businessStaff.deleteMany({});
  const bizDel = await tx.business.deleteMany({});
  const userDel = await tx.user.deleteMany({});
  const [roles, perms, rps] = await Promise.all([
    tx.role.count(), tx.permission.count(), tx.rolePermission.count(),
  ]);
  return { staffDel: staffDel.count, bizDel: bizDel.count, userDel: userDel.count, roles, perms, rps };
}).then((r) => { console.log(JSON.stringify(r)); return p.$disconnect(); })
  .catch((e) => { console.error(e.message); return p.$disconnect(); });
