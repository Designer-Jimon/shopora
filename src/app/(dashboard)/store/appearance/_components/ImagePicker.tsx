'use client';

// Image chooser for the properties panel: paste an image URL, or upload from
// the device via POST /api/businesses/upload (kind=design, 5 MB cap handled
// server-side).

import { useRef, useState } from 'react';
import { uploadDesignImage } from './design-api';
import { IconUpload, IconTrash } from './icons';

type Props = {
  value: string | undefined;
  onChange: (url: string) => void;
  onClear: () => void;
  placeholder?: string;
};

export default function ImagePicker({ value, onChange, onClear, placeholder = 'Paste an image URL /uploads/…' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyUrl = (url: string) => {
    const t = url.trim();
    if (!t) return;
    onChange(t);
    setDraft('');
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadDesignImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative h-20 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            title="Remove image"
            onClick={onClear}
            className="absolute right-1.5 top-1.5 rounded-md bg-white/90 p-1 text-red-600 shadow hover:bg-white"
          >
            <IconTrash className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-50"
        >
          {busy ? 'Uploading…' : (
            <>
              <IconUpload className="h-5 w-5" />
              <span className="text-[11px] font-medium">Upload an image</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyUrl(draft);
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => applyUrl(draft)}
          className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-primary)]"
        >
          Apply
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}