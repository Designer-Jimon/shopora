'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from '../_components/Stepper';
import { getBusiness, saveStep, completeOnboarding } from '../_components/api';

export default function SetupBrandingPage() {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [bannerUrl, setBannerUrl] = useState<string>('');
  const [brandColor, setBrandColor] = useState('#722F37');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getBusiness()
      .then((b) => {
        setLogoUrl(b.logoUrl ?? '');
        setBannerUrl(b.bannerUrl ?? '');
        setBrandColor(b.theme?.primaryColor || '#722F37');
        setDescription(b.description ?? '');
        setPhone(b.phone ?? '');
        setWhatsapp(b.whatsappNumber ?? '');
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function upload(kind: 'logo' | 'banner', file: File) {
    setUploading(kind);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch('/api/businesses/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      if (kind === 'logo') setLogoUrl(data.url);
      else setBannerUrl(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(null);
    }
  }

  function handleLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) upload('logo', f);
  }

  function handleBannerPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) upload('banner', f);
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      await saveStep(4, { description, phone, whatsappNumber: whatsapp, logoUrl, bannerUrl, brandColor });
      await completeOnboarding();
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const fieldCls =
    'mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none';

  return (
    <div>
      <Stepper current={4} />
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Make it yours</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Add your logo, banner, and brand colour. Your store opens in your style.
      </p>

      <div className="mt-6 space-y-6">
        {/* Brand colour */}
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Brand colour</h2>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)]" style={{ backgroundColor: brandColor || '#722F37' }}>
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-12 w-12 cursor-pointer opacity-0" aria-label="Brand colour" />
            </label>
            <input className="w-32 font-mono text-sm" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} placeholder="#722F37" />
            <span className="text-xs text-[var(--color-text-muted)]">Default: wine red #722F37</span>
          </div>
        </section>

        {/* Logo */}
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Logo</h2>
          <div className="mt-3 flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="h-16 w-16 rounded-lg border border-[var(--color-border)] object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">Logo</div>
            )}
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={handleLogoPick} />
            <button type="button" onClick={() => logoInput.current?.click()} disabled={uploading === 'logo'} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-50)] disabled:opacity-60">
              {uploading === 'logo' ? 'Uploading…' : logoUrl ? 'Change logo' : 'Upload logo'}
            </button>
          </div>
        </section>

        {/* Banner */}
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Store banner</h2>
          <div className="mt-3 flex items-center gap-4">
            {bannerUrl ? (
              <img src={bannerUrl} alt="banner" className="h-16 w-32 rounded-lg border border-[var(--color-border)] object-cover" />
            ) : (
              <div className="flex h-16 w-32 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">Banner</div>
            )}
            <input ref={bannerInput} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} />
            <button type="button" onClick={() => bannerInput.current?.click()} disabled={uploading === 'banner'} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-50)] disabled:opacity-60">
              {uploading === 'banner' ? 'Uploading…' : bannerUrl ? 'Change banner' : 'Upload banner'}
            </button>
          </div>
        </section>

        {/* Contact (re-confirm for storefront) */}
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Contact & description</h2>
          <div className="mt-3 space-y-4">
            <div>
              <label htmlFor="desc" className="text-sm font-medium text-[var(--color-text)]">Description</label>
              <textarea id="desc" className={fieldCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="phone" className="text-sm font-medium text-[var(--color-text)]">Phone</label>
                <input id="phone" className={fieldCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label htmlFor="wa" className="text-sm font-medium text-[var(--color-text)]">WhatsApp</label>
                <input id="wa" className={fieldCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              </div>
            </div>
          </div>
        </section>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-between">
          <a href="/setup/store" className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-white">Back</a>
          <button type="button" onClick={handleFinish} disabled={saving} className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Finishing…' : 'Finish & open my store'}
          </button>
        </div>
      </div>
    </div>
  );
}
