import MetricCard from '../_components/MetricCard';

// Placeholder metrics for the Phase 4 dashboard shell. No products/orders exist
// yet, so every value is zero/empty. Wired to real data in later phases.
const METRICS = [
  { label: 'Total sales', value: '₦0.00', hint: 'All time' },
  { label: 'Sales this month', value: '₦0.00', hint: 'September 2026' },
  { label: 'Total orders', value: '0', hint: 'All time' },
  { label: 'Pending orders', value: '0', hint: 'Awaiting fulfilment' },
  { label: 'Completed orders', value: '0', hint: 'Delivered' },
  { label: 'Total customers', value: '0', hint: 'Registered buyers' },
  { label: 'Low stock products', value: '0', hint: 'Below threshold' },
] as const;

function EmptyWidget({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-6">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
      <div className="mt-4 rounded-md border border-dashed border-[var(--color-border)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">{body}</p>
      </div>
    </div>
  );
}

export default function DashboardHomePage() {
  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Dashboard</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Here’s what’s happening in your store today.
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {METRICS.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} hint={m.hint} />
        ))}
      </div>

      {/* Recent orders + top products */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <EmptyWidget
          title="Recent orders"
          body="No orders yet. Your storefront checkout will feed orders here in Phase 5+."
        />
        <EmptyWidget
          title="Top selling products"
          body="No sales data yet. Products you add in Phase 5 will appear here once orders roll in."
        />
      </div>
    </div>
  );
}