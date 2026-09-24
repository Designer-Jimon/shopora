// SHOPORA — POST /api/businesses/complete
// Marks the current business's onboarding as complete, redirecting future
// visits away from the wizard. Requires an authenticated business_user who
// owns the business and has reached the branding step.

import prisma from '@/lib/prisma';
import { jsonOk, authErrors } from '@/lib/http';
import { requireAuth } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { ONBOARDING_DONE } from '@/lib/business';
import { ensureSubscription } from '@/lib/subscriptions/state';

export const POST = requireAuthHandler(async () => {
  const ctx = requireAuth();
  if (ctx.role !== 'business_user' || !ctx.businessId) {
    return authErrors.forbidden();
  }

  const current = await prisma.business.findUnique({ where: { id: ctx.businessId } });
  if (!current) return authErrors.notFound('Business not found');

  if (current.onboardingStep < 4) {
    return authErrors.badRequest('Complete the previous onboarding steps first');
  }

  // Defensive provisioning on the onboarding-completion boundary: the PRIMARY
  // path already provisions at business creation (register), but this linchpin
  // close any gap for a business that was created outside the registration flow
  // (seed/verification scripts) and then completed onboarding. Idempotent.
  await ensureSubscription(ctx.businessId);

  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: { onboardingStep: ONBOARDING_DONE },
    select: { id: true, slug: true, name: true },
  });

  return jsonOk({ id: updated.id, slug: updated.slug, name: updated.name, onboardingComplete: true });
});
