import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAccessToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function SetupIndexPage() {
  const token = (await cookies()).get('shopora_session')?.value;
  if (!token) redirect('/login');

  const claims = await verifyAccessToken(token, process.env.JWT_ACCESS_SECRET!);
  if (!claims?.businessId) redirect('/login');

  const biz = await prisma.business.findUnique({
    where: { id: claims.businessId },
    select: { onboardingStep: true },
  });
  const step = biz?.onboardingStep ?? 2;

  const target =
    step <= 2 ? '/setup/business' :
    step === 3 ? '/setup/store' :
    step >= 4 ? '/setup/branding' :
    '/setup/business';

  redirect(target);
}
