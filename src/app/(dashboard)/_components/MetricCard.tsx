// SHOPORA dashboard metric card — stat placeholder for the overview page.

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
};

export default function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-primary)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}