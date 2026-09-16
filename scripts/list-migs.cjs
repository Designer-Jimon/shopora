const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`
  .then((rows) => { console.log(JSON.stringify(rows, null, 2)); return p.$disconnect(); })
  .catch((e) => { console.error(e.message); return p.$disconnect(); });
