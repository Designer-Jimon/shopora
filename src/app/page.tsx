import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-[#1a1a1a]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <span className="text-lg font-black tracking-tight text-[var(--color-primary)]">
            SHOPORA
          </span>
          <nav className="flex items-center gap-4 sm:gap-8">
            <Link href="/dashboard" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
              Dashboard
            </Link>
            <Link href="/login" className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-white"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-20">
        <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">
          Build. <span className="text-[var(--color-primary)]">Sell.</span> Grow.
        </h1>
        <p className="mt-4 max-w-xl text-base text-[var(--color-text-muted)] sm:text-lg">
          SHOPORA is the e-commerce platform built for Nigerian and African
          businesses. Stand up a storefront, manage staff, and sell to your
          community — all in one place.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="rounded-md bg-[var(--color-primary)] px-6 py-3 text-center text-sm font-semibold text-white hover:bg-[var(--color-primary-800)]"
          >
            Open your dashboard
          </Link>
          <Link
            href="/#how-it-works"
            className="rounded-md border border-[var(--color-border)] px-6 py-3 text-center text-sm font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* Feature strip */}
      <section id="how-it-works" className="border-t border-[var(--color-border)] bg-[var(--color-primary-50)]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
          {[
            ['Build', 'A storefront on your own domain in minutes.'],
            ['Sell', 'Accept orders and grow your customer list.'],
            ['Grow', 'Insights and tools that scale with you.'],
          ].map(([title, body]) => (
            <div key={title}>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-sm text-[var(--color-text-muted)] sm:flex-row sm:justify-between sm:px-6">
          <span className="font-semibold text-[var(--color-primary)]">SHOPORA</span>
          <span>Built for African businesses. © {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}