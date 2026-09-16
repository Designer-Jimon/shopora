'use client';

type StepDef = { n: number; label: string; href: string };

const STEPS: StepDef[] = [
  { n: 2, label: 'Business info', href: '/setup/business' },
  { n: 3, label: 'Store URL', href: '/setup/store' },
  { n: 4, label: 'Branding', href: '/setup/branding' },
];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-1 sm:gap-2">
      {STEPS.map((s, i) => {
        const active = s.n === current;
        const done = s.n < current;
        return (
          <li key={s.n} className="flex flex-1 items-center gap-1 sm:gap-2" aria-current={active ? 'step' : undefined}>
            <a
              href={done ? s.href : undefined}
              className={`flex items-center gap-2 rounded-full px-1 sm:px-3 ${
                active
                  ? 'bg-[var(--color-primary)] text-white'
                  : done
                    ? 'text-[var(--color-primary)] hover:underline'
                    : 'text-[var(--color-text-muted)]'
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  active ? 'bg-white/25 text-white' : done ? 'bg-[var(--color-primary-100)]' : 'bg-gray-100'
                }`}
              >
                {done ? '✓' : s.n - 1}
              </span>
              <span className="hidden text-xs font-medium sm:inline">{s.label}</span>
            </a>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-[var(--color-border)]" />}
          </li>
        );
      })}
    </ol>
  );
}
