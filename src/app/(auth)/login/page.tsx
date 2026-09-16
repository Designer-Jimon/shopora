'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Unable to log in. Please try again.');
        setLoading(false);
        return;
      }
      // Business members go to the onboarding guard (completed → /dashboard,
      // mid-onboarding → the next wizard step). Customers go home.
      router.push(data?.businessId ? '/setup' : '/');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  const fieldCls =
    'mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none';

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Welcome back</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Log in to your SHOPORA account</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-[var(--color-text)]">Email</label>
          <input id="email" type="email" autoComplete="email" className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-[var(--color-text)]">Password</label>
          <input id="password" type="password" autoComplete="current-password" className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <button type="submit" disabled={loading} className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-800)] disabled:opacity-60">
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        New to SHOPORA?{' '}
        <Link href="/register" className="font-semibold text-[var(--color-primary)] hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}