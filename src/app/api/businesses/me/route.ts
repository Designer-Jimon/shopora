// SHOPORA — /api/businesses/me
//   GET  — return the current authenticated user's business (progress + data)
//   PATCH — persist business info / branding for a given onboarding step and
//           advance onboardingStep. Scoped to the owner's business via the
//           verified session businessId (never from client input).
//
// Steps: 2 = business info, 3 = store URL/slug, 4 = branding.

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { jsonOk, jsonError, authErrors } from '@/lib/http';
import { requireAuth } from '@/lib/tenant';
import { requireAuthHandler } from '@/lib/withTenant';
import { validateSlug, validateRequired, slugify } from '@/lib/validate';
import { getCurrentBusiness } from '@/lib/business';
import { resolveTheme } from '@/lib/theme';

export const GET = requireAuthHandler(async () => {
  const biz = await getCurrentBusiness();
  return jsonOk({
    id: biz.id,
    name: biz.name,
    slug: biz.slug,
    description: biz.description,
    category: biz.category,
    phone: biz.phone,
    whatsappNumber: biz.whatsappNumber,
    address: biz.address,
    state: biz.state,
    country: biz.country,
    logoUrl: biz.logoUrl,
    bannerUrl: biz.bannerUrl,
    theme: resolveTheme(biz.themeConfig),
    onboardingStep: biz.onboardingStep,
  });
});

export const PATCH = requireAuthHandler(async (request: NextRequest) => {
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return authErrors.badRequest('Invalid JSON body'); }

  const ctx = requireAuth();
  if (ctx.role !== 'business_user' || !ctx.businessId) {
    return authErrors.forbidden();
  }

  const current = await prisma.business.findUnique({ where: { id: ctx.businessId } });
  if (!current) return authErrors.notFound('Business not found');

  const step = Number(body.step ?? current.onboardingStep);

  const data: Record<string, unknown> = {};
  const errors: { field: string; message: string }[] = [];

  if (step === 2) {
    // ── Business info ────────────────────────────────────────────────
    if ('name' in body) {
      if (validateRequired(body.name, 'Business name')) {
        errors.push({ field: 'name', message: 'Business name is required' });
      } else {
        data.name = (body.name as string).trim();
      }
    }
    const optional = [
      'description',
      'category',
      'phone',
      'whatsappNumber',
      'address',
      'state',
      'country',
    ] as const;
    for (const field of optional) {
      if (field in body) data[field] = cleanStr(body[field]) ?? null;
    }
  } else if (step === 3) {
    // ── Store URL / slug ─────────────────────────────────────────────
    const slugRaw = typeof body.slug === 'string' ? body.slug : undefined;
    if (slugRaw === undefined || validateSlug(slugRaw)) {
      errors.push({ field: 'slug', message: 'A valid store slug is required' });
    } else {
      const slug = slugRaw.trim().toLowerCase();
      // Uniqueness is enforced here (registration also auto-uniquifies, but the
      // wizard requires the user to confirm an actually-available slug).
      const collision = await prisma.business.findFirst({
        where: { slug, id: { not: ctx.businessId } },
        select: { id: true },
      });
      if (collision) {
        const suggestion = slugify(current.name) || 'business';
        let slugAttempt = suggestion;
        let counter = 2;
        while (await prisma.business.findFirst({ where: { slug: slugAttempt, id: { not: ctx.businessId } } })) {
          slugAttempt = `${suggestion}-${counter}`;
          counter++;
        }
        return jsonError(`That store URL is already taken. Suggested: ${slugAttempt}`, 409);
      }
      data.slug = slug;
    }
  } else if (step === 4) {
    // ── Branding ─────────────────────────────────────────────────────
    if ('description' in body) data.description = cleanStr(body.description) ?? null;
    if ('phone' in body) data.phone = cleanStr(body.phone) ?? null;
    if ('whatsappNumber' in body) data.whatsappNumber = cleanStr(body.whatsappNumber) ?? null;
    if ('logoUrl' in body) data.logoUrl = cleanStr(body.logoUrl) ?? null;
    if ('bannerUrl' in body) data.bannerUrl = cleanStr(body.bannerUrl) ?? null;

    if ('brandColor' in body) {
      const color = cleanStr(body.brandColor);
      if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
        errors.push({ field: 'brandColor', message: 'Brand color must be a hex value like #722F37' });
      } else {
        const prev = (current.themeConfig && typeof current.themeConfig === 'object'
          ? current.themeConfig
          : {}) as Record<string, unknown>;
        data.themeConfig = {
          ...prev,
          primaryColor: color || undefined,
        };
        if (!color) delete (data.themeConfig as Record<string, unknown>).primaryColor;
      }
    }
  } else {
    return authErrors.badRequest('Unknown onboarding step');
  }

  if (errors.length > 0) {
    return jsonResponse({ error: 'Validation failed', errors }, 422);
  }

  // Persist and advance step (never move backwards).
  const nextStep = Math.max(current.onboardingStep, step + 1);
  const updated = await prisma.business.update({
    where: { id: ctx.businessId },
    data: { ...data, onboardingStep: nextStep } as never,
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      phone: true,
      whatsappNumber: true,
      address: true,
      state: true,
      country: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      themeConfig: true,
      onboardingStep: true,
    },
  });

  return jsonOk({
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    category: updated.category,
    phone: updated.phone,
    whatsappNumber: updated.whatsappNumber,
    address: updated.address,
    state: updated.state,
    country: updated.country,
    description: updated.description,
    logoUrl: updated.logoUrl,
    bannerUrl: updated.bannerUrl,
    theme: resolveTheme(updated.themeConfig),
    onboardingStep: updated.onboardingStep,
  });
});

function cleanStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t ? t : '';
}

function jsonResponse<T>(data: T, status: number): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}
