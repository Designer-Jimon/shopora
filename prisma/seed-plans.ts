// SHOPORA subscription plan seed — upserts the Free/Starter/Growth catalogue
// (idempotent, mirrors ensurePlansSeeded in src/lib/subscriptions). Rows keep
// their stable Phase 9 keys ('starter'|'business'|'premium'); display and
// prices were repurposed in Phase 11. Run via: npm run db:seed-plans

import { PrismaClient } from '@prisma/client';
import { SEED_PLANS } from '../src/lib/subscriptions/plans';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding subscription plans...');
  for (const p of SEED_PLANS) {
    const { key, ...data } = p;
    await prisma.subscriptionPlan.upsert({
      where: { name: key },
      update: {}, // Phase 10: admin-managed once created — never clobber edits
      create: { name: key, ...data },
    });
    console.log(`  → "${data.displayName}" (${key})`);
  }
  console.log('Subscription plans seeded.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });