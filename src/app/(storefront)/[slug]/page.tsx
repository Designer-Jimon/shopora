import Link from 'next/link';

const ALLOWED_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export default function StorefrontPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  const valid = ALLOWED_SLUG_PATTERN.test(slug) ? slug : null;

  if (!valid) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-primary)]">Store not found</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          The store &ldquo;{slug}&rdquo; does not exist.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          Back to SHOPORA
        </Link>
      </main>
    );
  }

  // TODO(phase 3): resolve tenant by slug → load Business + themeConfig →
  // render the live storefront. Phase 1 ships a static shell only.
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Storefront preview
      </span>
      <h1 className="text-3xl font-black tracking-tight text-[var(--color-primary)]">
        {slug}
      </h1>
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
        This is the tenant shell for <code className="text-[var(--color-primary)]">{slug}</code>.
        The live store (products, cart, checkout) arrives in later phases.
      </p>
    </main>
  );
}