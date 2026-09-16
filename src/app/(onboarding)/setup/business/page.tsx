'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Stepper from '../_components/Stepper';
import { getBusiness, saveStep } from '../_components/api';

export default function SetupBusinessPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusiness()
      .then((b) => {
        setName(b.name ?? '');
        setCategory(b.category ?? '');
        setDescription(b.description ?? '');
        setPhone(b.phone ?? '');
        setWhatsapp(b.whatsappNumber ?? '');
        setAddress(b.address ?? '');
        setState(b.state ?? '');
        setCountry(b.country ?? 'Nigeria');
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  async function handleNext(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await saveStep(2, {
        name,
        category,
        description,
        phone,
        whatsappNumber: whatsapp,
        address,
        state,
        country,
      });
      // If saved slug was still the auto-generated placeholder, nudge the store
      // step to re-suggest from the final name.
      router.push('/setup/store?fromName=' + encodeURIComponent(name));
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const fieldCls =
    'mt-1 block w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none';

  return (
    <div>
      <Stepper current={2} />
      <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Tell us about your business</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        This helps customers know who they&apos;re buying from. You can edit this later.
      </p>

      <form onSubmit={handleNext} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-[var(--color-text)]">Business name *</label>
          <input id="name" className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Ada Basket" />
        </div>

        <div>
          <label htmlFor="category" className="text-sm font-medium text-[var(--color-text)]">Category</label>
          <input id="category" className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Fashion, Beauty, Groceries" list="categories" />
          <datalist id="categories">
            {['Fashion', 'Beauty & Cosmetics', 'Food & Groceries', 'Home & Decor', 'Electronics', 'Health & Wellness', 'Handmade', 'Other'].map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div>
          <label htmlFor="description" className="text-sm font-medium text-[var(--color-text)]">Description</label>
          <textarea id="description" className={fieldCls} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What do you sell? What makes your store special?" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className="text-sm font-medium text-[var(--color-text)]">Phone</label>
            <input id="phone" className={fieldCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 800 000 0000" />
          </div>
          <div>
            <label htmlFor="whatsapp" className="text-sm font-medium text-[var(--color-text)]">WhatsApp number</label>
            <input id="whatsapp" className={fieldCls} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+234 ..." />
          </div>
        </div>

        <div>
          <label htmlFor="address" className="text-sm font-medium text-[var(--color-text)]">Address</label>
          <input id="address" className={fieldCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, city" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="state" className="text-sm font-medium text-[var(--color-text)]">State / Region</label>
            <input id="state" className={fieldCls} value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Lagos" />
          </div>
          <div>
            <label htmlFor="country" className="text-sm font-medium text-[var(--color-text)]">Country</label>
            <input id="country" className={fieldCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Nigeria" />
          </div>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-md bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
