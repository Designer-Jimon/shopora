// SHOPORA — POST /api/auth/register
// Creates a new user. If kind=business, also creates a Business + BusinessStaff
// (Owner) row in a single transaction. Auto-issues a session (login on register).

import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonCreated, authErrors, jsonValidationErrors, jsonError } from '@/lib/http';
import { validateEmail, validatePassword, validateRequired, validateSlug, slugify } from '@/lib/validate';
import { hashPassword } from '@/lib/auth/password';
import { setSessionCookies, issueTokenPair } from '@/lib/auth/session';

type RegisterKind = 'business' | 'customer';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const { email, password, firstName, lastName, kind, businessName, businessSlug } = body;

  // ── Validate ──────────────────────────────────────────────────────
  const errors: { field: string; message: string }[] = [];

  const emailErr = validateEmail(email);
  if (emailErr) errors.push({ field: 'email', message: emailErr });

  const pwErr = validatePassword(password);
  if (pwErr) errors.push({ field: 'password', message: pwErr });

  if (validateRequired(firstName, 'First name')) errors.push({ field: 'firstName', message: 'First name is required' });
  if (validateRequired(lastName, 'Last name')) errors.push({ field: 'lastName', message: 'Last name is required' });

  const registerKind: RegisterKind = (kind === 'business' || kind === 'customer') ? kind : 'customer';
  if (registerKind === 'business') {
    if (validateRequired(businessName, 'Business name')) errors.push({ field: 'businessName', message: 'Business name is required when registering as a business' });
    if (businessSlug) {
      const slugErr = validateSlug(businessSlug);
      if (slugErr) errors.push({ field: 'businessSlug', message: slugErr });
    }
  }

  if (errors.length > 0) return jsonValidationErrors(errors);

  // ── Check duplicate email ─────────────────────────────────────────
  const normalizedEmail = (email as string).trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) return authErrors.conflict('An account with this email already exists');

  // ── Resolve roles ─────────────────────────────────────────────────
  const [ownerRole, staffRole] = await Promise.all([
    prisma.role.findFirst({ where: { name: 'Owner' } }),
    prisma.role.findFirst({ where: { name: 'Staff' } }),
  ]);

  if (!ownerRole || !staffRole) {
    return authErrors.serverError('System roles not seeded. Run `npm run db:seed` first.');
  }

  // ── Create user (+ optional business) in a transaction ────────────
  const hashedPassword = await hashPassword(password as string);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashedPassword,
        firstName: (firstName as string).trim(),
        lastName: (lastName as string).trim(),
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    let businessId: string | undefined;
    let businessRoleName: string | undefined;

    if (registerKind === 'business') {
      // Generate slug: use provided slug, or auto-generate from business name
      let slug = businessSlug
        ? (businessSlug as string).trim().toLowerCase()
        : slugify(businessName as string);

      // Ensure unique slug — append suffix if taken
      let slugAttempt = slug;
      let counter = 2;
      while (await tx.business.findUnique({ where: { slug: slugAttempt } })) {
        slugAttempt = `${slug}-${counter}`;
        counter++;
      }

      const biz = await tx.business.create({
        data: {
          name: (businessName as string).trim(),
          slug: slugAttempt,
          // Phase 3: registration completes step 1 (account). The onboarding
          // wizard resumes from step 2 (business info).
          onboardingStep: 2,
        },
      });

      await tx.businessStaff.create({
        data: {
          userId: user.id,
          businessId: biz.id,
          roleId: ownerRole.id,
        },
      });

      businessId = biz.id;
      businessRoleName = 'Owner';
    }

    // Issue session tokens
    const { accessToken, refreshToken } = await issueTokenPair(user.id, {
      role: 'business_user',
      businessId,
      businessRole: businessRoleName,
      permissions: [],
    });

    // Update lastLoginAt
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { user, businessId, businessRoleName, accessToken, refreshToken };
  });

  // ── Build response with cookies ───────────────────────────────────
  const ACCESS_MAX  = 60 * 15;
  const REFRESH_MAX = 60 * 60 * 24 * 30;

  const response = jsonCreated({
    user: result.user,
    businessId: result.businessId ?? null,
    businessRole: result.businessRoleName ?? null,
  });

  return setSessionCookies(response, result.accessToken, result.refreshToken, ACCESS_MAX, REFRESH_MAX);
}
