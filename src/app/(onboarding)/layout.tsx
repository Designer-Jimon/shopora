import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';
import { isOnboardingComplete } from '@/lib/business';

/**
 * Onboarding route-group shell for a new business owner.
 *
 * Guard: only reachable by an authenticated `business_user` who has an active
 * membership in a business that is STILL mid-onboarding. Completed businesses
 * are redirected to /dashboard; unauthenticated users to /login.
 */

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get('shopora_session')?.value;
  if (!token) redirect('/login');

  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) redirect('/login');

  const claims = await verifyAccessToken(token, secret);
  if (!claims || !claims.sub || claims.role !== 'business_user' || !claims.businessId) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { isActive: true } });
  if (!user?.isActive) redirect('/login');

  const staff = await prisma.businessStaff.findFirst({
    where: { userId: claims.sub, businessId: claims.businessId, isActive: true },
    select: { id: true, business: { select: { name: true, onboardingStep: true, slug: true } } },
  });
  if (!staff) redirect('/login');

  const step = staff.business.onboardingStep;
  if (isOnboardingComplete(step)) redirect('/dashboard');

  return (
    <div className="min-h-screen bg-[var(--color-primary-50)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <a href="/" className="text-lg font-black tracking-tight text-[var(--color-primary)]">
            SHOPORA
          </a>
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            {staff.business.name}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
