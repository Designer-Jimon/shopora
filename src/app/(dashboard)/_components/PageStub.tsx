// SHOPORA dashboard page stub — placeholder for a not-yet-built section.

import Link from 'next/link';

export type StubLink = {
  label: string;
  href: string;
  description: string;
};

type PageStubProps = {
  title: string;
  description: string;
  /** Optional child pages to surface on a section landing page. */
  links?: StubLink[];
};

export default function PageStub({ title, description, links }: PageStubProps) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{title}</h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">{description}</p>

      <div className="mt-6 rounded-lg border border-dashed border-[var(--color-border)] bg-white p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-text)]">Coming soon</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          This section is a Phase 4 route stub. Its features will be built in later phases.
        </p>
      </div>

      {links && links.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[var(--color-border)] bg-white p-4 transition-colors hover:border-[var(--color-primary)]"
            >
              <span className="text-sm font-semibold text-[var(--color-primary)]">{link.label}</span>
              <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{link.description}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}