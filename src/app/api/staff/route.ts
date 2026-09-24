// SHOPORA — /api/staff
//   POST — invite a team member (Staff role). Owner/manager only.
//   Enforces the subscription's staffLimit (own seats). The invitee gets a
//   one-time temporary password returned in the response for the owner to
//   share; it is hashed on storage and can never be retrieved again.

import { NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import prisma from '@/lib/prisma';
import { jsonCreated, jsonError, authErrors, jsonValidationErrors } from '@/lib/http';
import { requireAuth, requirePermission } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { hashPassword } from '@/lib/auth/password';
import { validateEmail, validateRequired } from '@/lib/validate';
import { getSubscriptionState } from '@/lib/subscriptions/state';

export const POST = requireAuthHandler(async (request: NextRequest) => {
  requirePermission('staff.manage');
  const ctx = requireAuth();
  if (!ctx.businessId) return authErrors.forbidden();

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';

  const errors: { field: string; message: string }[] = [];
  const emailErr = validateEmail(email);
  if (emailErr) errors.push({ field: 'email', message: emailErr });
  if (validateRequired(firstName, 'First name')) errors.push({ field: 'firstName', message: 'First name is required' });
  if (validateRequired(lastName, 'Last name')) errors.push({ field: 'lastName', message: 'Last name is required' });
  if (errors.length > 0) return jsonValidationErrors(errors);

  const staffRole = await prisma.role.findFirst({ where: { name: 'Staff' } });
  if (!staffRole) return authErrors.serverError('System roles not seeded. Run `npm run db:seed` first.');

  // Staff seats are capped by the plan; the primary owner's seat is free.
  const [memberCount, existingUser] = await Promise.all([
    prisma.businessStaff.count({
      where: { businessId: ctx.businessId, role: { name: { not: 'Owner' } }, isActive: true },
    }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  const sub = await getSubscriptionState(ctx.businessId);
  if (memberCount >= sub.staffLimit) {
    return jsonError(`Staff limit reached (${sub.staffLimit}). Upgrade your subscription to add more team members.`, 403);
  }

  if (existingUser) {
    // One-business-per-account invariant (DB-enforced): a user can hold a
    // BusinessStaff row on at most one business. If they already belong to
    // THIS business → they're already on the team; if they belong to a DIFFERENT
    // business → there is no supported way to add them here. Both reject with a
    // clear 409 instead of attempting a write that would violate the unique
    // BusinessStaff.userId constraint.
    const existingMembership = await prisma.businessStaff.findFirst({
      where: { userId: existingUser.id },
      include: { business: { select: { name: true } } },
    });
    if (existingMembership) {
      if (existingMembership.businessId === ctx.businessId) {
        return authErrors.conflict('This user is already a member of your store');
      }
      return authErrors.conflict(
        `This account already belongs to ${existingMembership.business.name}. One business per account is enforced — invite them with a different email.`,
      );
    }
  }

  // One-time temporary password (meets the ≥8-char policy). Hashed at rest.
  const temporaryPassword = `Shopora!${randomBytes(6).toString('hex')}`;
  const hashed = await hashPassword(temporaryPassword);

  const member = await prisma.$transaction(async (tx) => {
    const user = existingUser
      ? existingUser
      : await tx.user.create({
          data: { email, passwordHash: hashed, firstName, lastName },
          select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
        });
    await tx.businessStaff.create({
      data: { userId: user.id, businessId: ctx.businessId!, roleId: staffRole.id },
    });
    return user;
  });

  return jsonCreated({ member, role: 'Staff', temporaryPassword });
});