// SHOPORA business helpers — fetch the business owned/leveled by the current
// authenticated user from the tenant context, plus onboarding status.

import { requireAuth } from '@/lib/tenant';
import prisma from '@/lib/prisma';
import { ForbiddenError } from '@/lib/tenant';

export const ONBOARDING_DONE = 99; // sentinel value marking onboarding complete

export type CurrentBusiness = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  phone?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  state?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  themeConfig: unknown;
  onboardingStep: number;
};

/**
 * Load the business the current authenticated user belongs to (as the active
 * BusinessStaff member resolving from the tenant context's businessId).
 *
 * Throws AuthRequiredError / ForbiddenError for unauthenticated or
 * non-business users. The businessId always comes from the verified session,
 * never from client input — this keeps writes scoped to the right tenant.
 */
export async function getCurrentBusiness(): Promise<CurrentBusiness> {
  const ctx = requireAuth();

  if (ctx.role !== 'business_user' || !ctx.businessId) {
    throw new ForbiddenError('business');
  }

  const business = await prisma.business.findUnique({
    where: { id: ctx.businessId },
  });

  if (!business) throw new ForbiddenError('business');

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    description: business.description,
    category: business.category,
    phone: business.phone,
    whatsappNumber: business.whatsappNumber,
    address: business.address,
    state: business.state,
    country: business.country,
    logoUrl: business.logoUrl,
    bannerUrl: business.bannerUrl,
    themeConfig: business.themeConfig,
    onboardingStep: business.onboardingStep,
  };
}

/** True when the business has finished all onboarding steps. */
export function isOnboardingComplete(step: number): boolean {
  return step >= ONBOARDING_DONE;
}
