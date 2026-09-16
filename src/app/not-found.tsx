import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <h1 className="text-3xl font-black tracking-tight text-[var(--color-primary)]">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
        The page you&rsquo;re looking for does not exist or is no longer available.
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