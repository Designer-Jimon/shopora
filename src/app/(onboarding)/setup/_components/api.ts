'use client';

export type BusinessData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  address: string | null;
  state: string | null;
  country: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  theme: { primaryColor: string };
  onboardingStep: number;
};

/** GET the current business's onboarding data. */
export async function getBusiness(): Promise<BusinessData> {
  const res = await fetch('/api/businesses/me', { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Failed to load business');
  return data as BusinessData;
}

/** PATCH business data for a given step. */
export async function saveStep(step: number, data: Record<string, unknown>) {
  const res = await fetch('/api/businesses/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...data }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || (body?.errors?.map((e: { message: string }) => e.message).join(', ') || 'Failed to save'));
  return body as BusinessData & { error?: string };
}

/** Mark onboarding complete. */
export async function completeOnboarding() {
  const res = await fetch('/api/businesses/complete', { method: 'POST' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Failed to complete onboarding');
  return body;
}

/** Check slug availability. */
export async function checkSlug(slug: string): Promise<{ slug: string; available: boolean; suggestion: string }> {
  const res = await fetch(`/api/businesses/check-slug?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' });
  return res.json();
}

/** Suggest a slug from a name. */
export async function suggestSlug(name: string): Promise<{ slug: string }> {
  const res = await fetch('/api/businesses/suggest-slug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
