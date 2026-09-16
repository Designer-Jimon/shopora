import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';

export const dynamic = 'force-dynamic';

/**
 * Auth route-group shell (login / register).
 *
 * Guard: an already-authenticated visitor is sent to /dashboard (the dashboard
 * layout re-routes mid-onboarding owners to /setup and customers back home).
 * Unauthenticated visitors see the auth card in a plain white shell.
 */

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get('shopora_session')?.value;
  if (token) {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (secret) {
      const claims = await verifyAccessToken(token, secret).catch(() => null);
      if (claims?.sub) redirect('/dashboard');
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-primary-50)] px-4 py-10">
      <a href="/" className="mb-6 text-2xl font-black tracking-tight text-[var(--color-primary)]">
        SHOPORA
      </a>
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--color-text-muted)]">
        Build. Sell. Grow. — for African businesses. © {new Date().getFullYear()}
      </p>
    </main>
  );
}