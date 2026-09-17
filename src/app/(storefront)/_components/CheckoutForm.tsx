'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CartView } from '@/lib/cart';
import type { DeliveryMethod } from '@/lib/order';
import { formatPrice } from '@/lib/format';

type Props = {
  slug: string;
  cart: CartView;
  deliveryMethods: DeliveryMethod[];
};

const STEPS = ['Contact', 'Delivery', 'Method', 'Review'] as const;
type Step = (typeof STEPS)[number];

type FormState = {
  name: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  address: string;
  landmark: string;
  method: string;
  notes: string;
};

export default function CheckoutForm({ slug, cart, deliveryMethods }: Props) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    phone: '',
    state: '',
    city: '',
    address: '',
    landmark: '',
    method: deliveryMethods[0]?.id ?? 'pickup',
    notes: '',
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const step = STEPS[stepIdx];
  const method = useMemo(
    () => deliveryMethods.find((m) => m.id === form.method) ?? deliveryMethods[0],
    [deliveryMethods, form.method],
  );
  const isPickup = method?.id === 'pickup';
  const deliveryFee = method?.fee ?? 0;
  const total = cart.subtotal + deliveryFee;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldError(null);
  }

  function validateStep(current: Step): string | null {
    if (current === 'Contact') {
      if (!form.name.trim()) return 'Please enter your full name';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Please enter a valid email address';
      if (form.phone.trim() && form.phone.trim().length < 7) return 'Phone number looks too short';
      return null;
    }
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) {
      setFieldError(err);
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function back() {
    setFieldError(null);
    setSubmitError(null);
    setStepIdx((i) => Math.max(0, i - 1));
  }

  async function placeOrder() {
    if (cart.empty) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/store/${slug}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          deliveryMethod: form.method,
          deliveryAddress: isPickup
            ? null
            : { state: form.state, city: form.city, address: form.address, landmark: form.landmark || null },
          notes: form.notes || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Could not place your order. Please try again.');
        return;
      }
      // Clear the (server) cart badge cache before navigating.
      router.refresh();
      router.push(data.redirectTo);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'mt-1 w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2';
  const inputStyle = {
    borderColor: 'var(--sf-border)',
    background: 'var(--sf-bg)',
    color: 'var(--sf-text)',
    ['--tw-ring-color' as string]: 'var(--sf-primary)',
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="rounded-lg border p-5 sm:p-6" style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}>
        {/* Stepper */}
        <ol className="flex items-center gap-2 text-xs">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  i === stepIdx
                    ? ''
                    : i < stepIdx
                      ? 'opacity-60'
                      : 'opacity-30'
                }`}
                style={{
                  background: i <= stepIdx ? 'var(--sf-primary)' : 'var(--sf-tint)',
                  color: i <= stepIdx ? 'var(--sf-on-primary)' : 'var(--sf-muted)',
                }}
              >
                {i + 1}
              </span>
              <span
                className={i === stepIdx ? 'font-semibold' : 'text-[var(--sf-muted)]'}
                style={{ color: i <= stepIdx ? 'var(--sf-text)' : 'var(--sf-muted)' }}
              >
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-[var(--sf-border)]" />}
            </li>
          ))}
        </ol>

        <div className="mt-6">
          {step === 'Contact' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                  Full name
                </label>
                <input
                  id="name"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Ada Obi"
                />
              </div>
              <div>
                <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="ada@example.com"
                />
              </div>
              <div>
                <label htmlFor="phone" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                  Phone (optional)
                </label>
                <input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="+234 801 234 5678"
                />
              </div>
            </div>
          )}

          {step === 'Delivery' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="state" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                    State
                  </label>
                  <input
                    id="state"
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Lagos"
                  />
                </div>
                <div>
                  <label htmlFor="city" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                    City / town
                  </label>
                  <input
                    id="city"
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    className={inputCls}
                    style={inputStyle}
                    placeholder="Ikoyi"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="address" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                  Street address
                </label>
                <input
                  id="address"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="12 Bourdillon Road"
                />
              </div>
              <div>
                <label htmlFor="landmark" className="text-sm font-medium" style={{ color: 'var(--sf-text)' }}>
                  Landmark (optional)
                </label>
                <input
                  id="landmark"
                  value={form.landmark}
                  onChange={(e) => set('landmark', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Near Ikoyi Club"
                />
              </div>
              <p className="text-xs text-[var(--sf-muted)]">
                Not needed if you select Pickup as your delivery method.
              </p>
            </div>
          )}

          {step === 'Method' && (
            <div className="space-y-3">
              {deliveryMethods.map((m) => {
                const active = form.method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => set('method', m.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition"
                    style={{
                      borderColor: active ? 'var(--sf-primary)' : 'var(--sf-border)',
                      background: active ? 'var(--sf-tint)' : 'var(--sf-bg)',
                    }}
                  >
                    <span>
                      <span className="block text-sm font-semibold" style={{ color: 'var(--sf-text)' }}>
                        {m.name}
                      </span>
                      {m.description && (
                        <span className="block text-xs text-[var(--sf-muted)]">{m.description}</span>
                      )}
                    </span>
                    <span className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>
                      {m.fee === 0 ? 'Free' : formatPrice(m.fee)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 'Review' && (
            <div className="space-y-4">
              <div className="rounded-md p-4" style={{ background: 'var(--sf-tint)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Items</p>
                <ul className="mt-2 space-y-2">
                  {cart.items.map((line) => (
                    <li key={line.id} className="flex justify-between gap-3 text-sm">
                      <span style={{ color: 'var(--sf-text)' }}>
                        {line.quantity} × {line.name}
                        {line.variantLabel && (
                          <span className="text-[var(--sf-muted)]"> — {line.variantLabel}</span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium" style={{ color: 'var(--sf-text)' }}>
                        {formatPrice(line.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Contact</p>
                  <p className="mt-1" style={{ color: 'var(--sf-text)' }}>{form.name}</p>
                  <p className="text-[var(--sf-muted)]">{form.email}</p>
                  {form.phone && <p className="text-[var(--sf-muted)]">{form.phone}</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Delivery</p>
                  <p className="mt-1" style={{ color: 'var(--sf-text)' }}>{method?.name}</p>
                  {!isPickup && (
                    <p className="text-[var(--sf-muted)]">
                      {[form.address, form.city, form.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {fieldError && (
          <p className="mt-4 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--sf-tint)', color: '#b91c1c' }}>
            {fieldError}
          </p>
        )}
        {submitError && (
          <p className="mt-4 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--sf-tint)', color: '#b91c1c' }}>
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={stepIdx === 0 || submitting}
            className="rounded-md border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
            style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-text)' }}
          >
            Back
          </button>
          {step === 'Review' ? (
            <button
              type="button"
              onClick={placeOrder}
              disabled={submitting || cart.empty}
              className="rounded-md px-5 py-2.5 text-sm font-bold transition hover:brightness-110 disabled:opacity-50"
              style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
            >
              {submitting ? 'Placing order…' : `Place order · ${formatPrice(total)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              className="rounded-md px-5 py-2.5 text-sm font-bold"
              style={{ background: 'var(--sf-primary)', color: 'var(--sf-on-primary)' }}
            >
              Continue
            </button>
          )}
        </div>
      </div>

      <aside className="h-fit rounded-lg border p-5" style={{ borderColor: 'var(--sf-border)', background: 'var(--sf-bg)' }}>
        <p className="text-sm font-bold" style={{ color: 'var(--sf-text)' }}>Order summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--sf-muted)]">Subtotal ({cart.itemCount} items)</dt>
            <dd className="font-medium" style={{ color: 'var(--sf-text)' }}>{formatPrice(cart.subtotal)}</dd>
          </div>
          {cart.discountTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--sf-muted)]">You save</dt>
              <dd className="font-medium" style={{ color: '#15803d' }}>−{formatPrice(cart.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-[var(--sf-muted)]">Delivery</dt>
            <dd className="font-medium" style={{ color: 'var(--sf-text)' }}>
              {deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}
            </dd>
          </div>
          <div className="flex justify-between border-t pt-2" style={{ borderColor: 'var(--sf-border)' }}>
            <dt className="font-semibold" style={{ color: 'var(--sf-text)' }}>Total</dt>
            <dd className="font-black" style={{ color: 'var(--sf-text)' }}>{formatPrice(total)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-[var(--sf-muted)]">
          Payment is not processed yet — you&apos;ll settle on delivery. Payment &amp;
          gateways arrive in a later phase.
        </p>
        <Link
          href={`/${slug}/cart`}
          className="mt-3 block text-center text-xs text-[var(--sf-muted)] hover:text-[var(--sf-primary)]"
        >
          Back to cart
        </Link>
      </aside>
    </div>
  );
}