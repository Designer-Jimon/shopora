'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [kind, setKind] = useState<'business' | 'customer'>('business');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          kind,
          businessName: kind === 'business' ? businessName : undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
          setError(data.errors.map((err: { message: string }) => err.message).join(' '));
        } else {
          setError(data?.error || 'Unable to create your account. Please try again.');
        }
        setLoading(false);
        return;
      }
      // Business registration auto-logs-in → the Phase 3 onboarding wizard
      // resumes. Customer accounts land back on the landing page.
      router.push(kind === 'business' ? '/setup' : '/');
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
      <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">Create your account</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Start selling in minutes</p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-primary-50)] p-1">
        <button
          type="button"
          onClick={() => setKind('business')}
          className={`rounded px-3 py-1.5 text-sm font-semibold ${kind === 'business' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}
        >
          I have a business
        </button>
        <button
          type="button"
          onClick={() => setKind('customer')}
          className={`rounded px-3 py-1.5 text-sm font-semibold ${kind === 'customer' ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}
        >
          I&apos;m shopping
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="text-sm font-medium text-[var(--color-text)]">First name</label>
            <input id="firstName" autoComplete="given-name" className={fieldCls} value={firstName} onChange={(e) => setFirstName(e.target.value)} required placeholder="Ada" />
          </div>
          <div>
            <label htmlFor="lastName" className="text-sm font-medium text-[var(--color-text)]">Last name</label>
            <input id="lastName" autoComplete="family-name" className={fieldCls} value={lastName} onChange={(e) => setLastName(e.target.value)} required placeholder="Bello" />
          </div>
        </div>

        {kind === 'business' && (
          <div>
            <label htmlFor="businessName" className="text-sm font-medium text-[var(--color-text)]">Business name</label>
            <input id="businessName" className={fieldCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} required placeholder="e.g. Ada Basket" />
          </div>
        )}

        <div>
          <label htmlFor="email" className="text-sm font-medium text-[var(--color-text)]">Email</label>
          <input id="email" type="email" autoComplete="email" className={fieldCls} value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium text-[var(--color-text)]">Password</label>
          <input id="password" type="password" autoComplete="new-password" minLength={8} className={fieldCls} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters" />
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <button type="submit" disabled={loading} className="w-full rounded-md bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--color-primary-800)] disabled:opacity-60">
          {loading ? 'Creating…' : kind === 'business' ? 'Create business account' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[var(--color-primary)] hover:underline">
          Log in
        </Link>
      </p>
    </>
  );
}