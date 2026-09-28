'use client';

// Small, dependency-free form controls used by the Properties panel.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ELEMENT_LIMITS } from '@/lib/storefront-design/types';

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Compact stacked field for two-column grids: label on its own line above a
 * full-width control, so a narrow cell can never push the control over the
 * neighbour label/number (the w-64-ish panel width can't fit an inline label
 * + number input side by side in two columns). */
export function GridField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  className = 'w-24',
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      className={`${className} rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-right text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none`}
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
    />
  );
}

export function RangeField({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="flex w-40 items-center gap-2">
      <input
        type="range"
        className="h-1.5 w-full accent-[var(--color-primary,#722F37)]"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-[var(--color-text-muted)]">{value}</span>
    </div>
  );
}

/** Image zoom (100–300%) with +/- stepping and a live percentage readout.
 * While the input is being edited the raw keystrokes are kept verbatim (so
 * typing a fresh value isn't fought by the range clamp) and the clamped value
 * is still pushed up live; the field re-formats on blur / Enter. */
export function ZoomField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const lastSent = useRef<number | null>(null);
  const clampV = (v: number) => Math.min(ELEMENT_LIMITS.maxZoom, Math.max(ELEMENT_LIMITS.minZoom, Math.round(v)));
  const current = Number.isFinite(value) ? Math.round(value) : ELEMENT_LIMITS.minZoom;

  // A value we did NOT emit ourselves (canvas +/- , wheel, undo, another
  // surface) wins over the in-progress keystrokes, so the field always mirrors
  // the canvas even while it has focus.
  useEffect(() => {
    if (lastSent.current !== value) setText(null);
  }, [value]);

  const emit = (v: number) => {
    lastSent.current = v;
    onChange(v);
  };

  const step = (delta: number) => {
    setText(null);
    emit(clampV(current + delta));
  };
  // Live sync while typing: parse what is there, clamp it, never rewrite the
  // user's text mid-edit (that would fight the caret).
  const onType = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(n)) emit(clampV(n));
  };
  const settle = () => {
    const raw = text ?? '';
    const n = Number(raw);
    const next = clampV(raw.trim() !== '' && Number.isFinite(n) ? n : ELEMENT_LIMITS.minZoom);
    setText(null);
    if (next !== current) emit(next);
  };

  return (
    <div className="flex items-center gap-1.5">
      <IconButton title="Zoom out (−25%)" onClick={() => step(-25)}>
        <span className="block px-0.5 text-sm leading-none">-</span>
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1 focus-within:border-[var(--color-primary)]">
        <input
          type="number"
          min={ELEMENT_LIMITS.minZoom}
          max={ELEMENT_LIMITS.maxZoom}
          step={25}
          className="w-full min-w-0 bg-transparent text-right text-sm tabular-nums text-[var(--color-text)] focus:outline-none"
          value={text ?? String(current)}
          onChange={(e) => onType(e.target.value)}
          onBlur={settle}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            settle();
            (e.target as HTMLInputElement).blur();
          }}
          aria-label="Zoom"
        />
        <span className="shrink-0 text-[11px] font-semibold text-[var(--color-text-muted)]">%</span>
      </div>
      <IconButton title="Zoom in (+25%)" onClick={() => step(25)}>
        <span className="block px-0.5 text-sm leading-none">+</span>
      </IconButton>
    </div>
  );
}

export function ColorField({
  value,
  onChange,
  preset,
}: {
  value: string;
  onChange: (v: string) => void;
  preset?: string[] | null;
}) {
  const colors = preset ?? [
    '#1A1A1A', '#4B5563', '#FFFFFF', '#722F37', '#D16BA5',
    '#0EA5E9', '#15803D', '#F59E0B', '#EA7C3C', '#101418',
  ];
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="h-7 w-9 cursor-pointer rounded border border-[var(--color-border)] bg-white p-0.5"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1A1A1A'}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <div className="flex flex-wrap gap-1">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Colour ${c}`}
            onClick={() => onChange(c)}
            className={`h-5 w-5 rounded-full border ${
              value.toLowerCase() === c.toLowerCase()
                ? 'border-black ring-2 ring-black/20'
                : 'border-black/10 hover:border-black/30'
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-sm text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5 border-t border-[var(--color-border)] px-4 py-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{title}</h3>
      {children}
    </div>
  );
}

export function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-[var(--color-border)] bg-white p-1.5 text-[var(--color-text-muted)] transition hover:text-[var(--color-text)] disabled:opacity-40 disabled:hover:text-[var(--color-text-muted)]"
    >
      {children}
    </button>
  );
}