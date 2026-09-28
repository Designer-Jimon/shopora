'use client';

// Design Studio home: template gallery to start from + the business's saved
// designs. Renders live thumbnails straight from each design's JSON document.

import { useState } from 'react';
import Link from 'next/link';
import DesignThumb from './DesignThumb';
import { deleteDesign, updateDesign } from './design-api';
import { IconPlus, IconCheck } from './icons';
import { TEMPLATES } from '@/lib/storefront-design/templates';
import { blankDoc } from '@/lib/storefront-design/types';
import type { DesignDto } from '@/lib/storefront-design/serialize';

type Props = {
  designs: DesignDto[];
  canWrite: boolean;
  businessSlug: string;
};

export default function DesignStudioHome({ designs: initialDesigns, canWrite, businessSlug }: Props) {
  const [designs, setDesigns] = useState(initialDesigns);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startRename = (d: DesignDto) => {
    setRenamingId(d.id);
    setRenameValue(d.name);
    setError(null);
  };

  const confirmRename = async (d: DesignDto) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    setBusyId(d.id);
    setError(null);
    try {
      await updateDesign(d.id, { name });
      setDesigns((prev) => prev.map((x) => (x.id === d.id ? { ...x, name } : x)));
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename');
    } finally {
      setBusyId(null);
    }
  };

  const removeDesign = async (d: DesignDto) => {
    if (!window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    setBusyId(d.id);
    setError(null);
    try {
      await deleteDesign(d.id);
      setDesigns((prev) => prev.filter((x) => x.id !== d.id));
      setNotice(`Deleted “${d.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    } finally {
      setBusyId(null);
    }
  };

  const blankDocMemo = blankDoc();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Design Studio</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-text-muted)]">
            Design the hero of your storefront — drag layers, pick colours, preview at every device
            size and publish when ready. Your published design drives the live storefront immediately.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/store/appearance/design"
            className="mt-3 inline-flex shrink-0 items-center gap-1.5 self-start rounded-md px-4 py-2 text-sm font-bold text-white transition hover:brightness-95 sm:mt-0"
            style={{ background: 'var(--color-primary)' }}
          >
            <IconPlus className="h-4 w-4" /> Start a new design
          </Link>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Start from a template</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <Link
            href="/store/appearance/design"
            onClick={() => setNotice(null)}
            className="group overflow-hidden rounded-xl border border-dashed border-[var(--color-border)] bg-white transition hover:border-[var(--color-primary)]"
          >
            <DesignThumb doc={blankDocMemo} className="w-full" />
            <div className="border-t border-[var(--color-border)] px-3 py-2.5">
              <p className="text-sm font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">Blank canvas</p>
              <p className="text-xs text-[var(--color-text-muted)]">Start from scratch</p>
            </div>
          </Link>
          {TEMPLATES.map((t) => (
            <Link
              key={t.id}
              href={`/store/appearance/design?template=${encodeURIComponent(t.id)}`}
              onClick={() => setNotice(null)}
              className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-white transition hover:border-[var(--color-primary)]"
            >
              <DesignThumb doc={t.doc} className="w-full" />
              <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--color-text)] group-hover:text-[var(--color-primary)]">{t.name}</p>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.accent }} />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">{t.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)]">My designs</h2>
        {designs.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            No designs yet — start from a template or a blank canvas above.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {designs.map((d) => (
              <div
                key={d.id}
                className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-white transition hover:border-[var(--color-primary)]"
              >
                <Link href={`/store/appearance/design?id=${d.id}`} className="block" aria-label={`Edit ${d.name}`}>
                  <DesignThumb doc={{ canvas: d.canvas, elements: d.elements }} className="w-full" />
                </Link>
                <div className="border-t border-[var(--color-border)] px-3 py-2.5">
                  {renamingId === d.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        confirmRename(d);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm font-bold text-[var(--color-text)] focus:border-[var(--color-primary)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={busyId === d.id}
                        className="rounded-md p-1 text-[var(--color-text)] hover:text-[var(--color-primary)] disabled:opacity-40"
                        aria-label="Save name"
                      >
                        <IconCheck className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">{d.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          d.status === 'published'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-[var(--color-tint,#F0F0F2)] text-[var(--color-text-muted)]'
                        }`}
                      >
                        {d.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {d.elements.length} layer{d.elements.length === 1 ? '' : 's'} · {d.canvas.width}×{d.canvas.height}
                    {d.status === 'published' && (
                      <Link href={`/${businessSlug}`} className="ml-2 font-semibold text-[var(--color-primary)] hover:underline">
                        Live on storefront →
                      </Link>
                    )}
                  </p>
                  {canWrite && (
                    <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <Link
                        href={`/store/appearance/design?id=${d.id}`}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-tint,#F9FAFB)]"
                      >
                        Edit
                      </Link>
                      {renamingId !== d.id && (
                        <button
                          type="button"
                          onClick={() => startRename(d)}
                          className="rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--color-text)] hover:bg-[var(--color-tint,#F9FAFB)]"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeDesign(d)}
                        disabled={busyId === d.id}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}