// SHOPORA — billing:daily standalone job. Runs on whatever scheduler the
// platform owner picks (cron, task scheduler, CI). Prints how many
// subscriptions were soft-downgraded to the Free plan this run and exits 0.
//
// Run with: npm run billing:daily
//
// Failure mode: EPERM-free, plain Prisma — exits non-zero on job errors so the
// scheduler can alert.

import { runBillingDowngrades } from '../src/lib/subscriptions/billing';

async function main() {
  const startedAt = new Date();
  const result = await runBillingDowngrades();
  const elapsedMs = Date.now() - startedAt.getTime();
  console.log(
    `[billing:daily] checked ${result.checked} subscription(s), downgraded ${result.downgraded} — ${elapsedMs}ms`,
  );
  for (const entry of result.reasons) {
    console.log(`  → downgraded ${entry.businessId}: ${entry.reason}`);
  }
}

main()
  .catch((err) => {
    console.error('[billing:daily] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    process.exit(0);
  });