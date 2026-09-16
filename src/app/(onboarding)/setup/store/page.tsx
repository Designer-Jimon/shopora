'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stepper from '../_components/Stepper';
import { getBusiness, saveStep, checkSlug } from '../_components/api';

export default function SetupStorePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>}>
      <StoreForm />
    </Suspense>
  );
}

function StoreForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [slug, setSlug] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [checking, setChecking] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [suggestion, setSuggestion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromName = params.get('fromName');

  useEffect(() => {
    getBusiness()
      .then(async (b) => {
        setBusinessName(b.name || '');
        // If user just came from step 2 (or has no slug worth keeping), suggest
        // from the name; otherwise keep the current slug for explicit review.
        const base = fromName ?? b.name ?? '';
        const suggestion = await fetch('/api/businesses/suggest-slug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: base || b.name }),
        }).then((r) => r.json()).catch(() => ({ slug: b.slug }));
        setSuggestion(suggestion.slug || b.slug);
        setSlug(suggestion.slug || b.slug);
        setLoading(false);
        runCheck(suggestion.slug || b.slug);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromName]);

  async function runCheck(s: string) {
    if (!s) return;
    setChecking('checking');
    const res = await checkSlug(s);
    setChecking(res.available ? 'available' : 'taken');
    if (!res.available) setSuggestion(res.suggestion);
  }

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await saveStep(3, { slug });
      if (res && (res as unknown as { error?: string }).error) {
        setError((res as unknown as { error: string }).error);
        setChecking('taken');
        setSaving(false);
        return;
      }
      router.push('/setup/branding');
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      if (/already taken/i.test(msg)) setChecking('taken');
      setSaving(false);
    }
  }

  const fieldCls =
    'mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none';

  return (
    <div>
      <Stepper current={3} />
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Choose your store URL</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        This is where customers will find you — like{' '}
        <span className="font-medium text-[var(--color-text)]">{businessName || 'your-store'}.shopora.ng</span>
      </p>

      <form onSubmit={handleNext} className="mt-6 space-y-4">
        <div>
          <label htmlFor="slug" className="text-sm font-medium text-[var(--color-text)]">
            Store URL * <span className="font-normal text-[var(--color-text-muted)]">(you can edit)</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">/</span>
            <input
              id="slug"
              className={`${fieldCls} font-mono uppercase`}
              value={slug}
              onChange={(e) => { setSlug(e.target.value.toLowerCase()); runCheck(e.target.value.toLowerCase()); }}
              required
              disabled={loading}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {checking === 'checking' && 'Checking availability…'}
            {checking === 'available' && <span className="text-[var(--color-success)]">Available ✓</span>}
            {checking === 'taken' && (
              <span className="text-[var(--color-danger)]">
                That URL is taken. Try <button type="button" className="underline" onClick={() => { setSlug(suggestion); runCheck(suggestion); }}>{suggestion}</button>
              </span>
            )}
          </p>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-between">
          <a href="/setup/business" className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-white">
            Back
          </a>
          <button type="submit" disabled={saving || checking !== 'available'} className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
