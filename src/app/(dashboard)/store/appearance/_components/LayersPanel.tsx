'use client';

// Layer stack (right-side panel in the editor): ordered top→bottom, exactly
// matching the array order (later element = on top). Click selects, pencil
// buttons move a layer up/down in the stack.

import RenderElement from './renderElement';
import { IconArrowUp, IconArrowDown, IconTrash, IconCopy } from './icons';
import type { StorefrontElement } from '@/lib/storefront-design/types';

type Props = {
  elements: StorefrontElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** An image/logo element whose image content is the focal-pan target. */
  onFocusImage?: (id: string) => void;
  focusedImageId?: string | null;
};

function labelFor(el: StorefrontElement): string {
  if (el.type === 'text' || el.type === 'button') {
    const t = (el.text ?? '').trim();
    return t ? t.slice(0, 22) : el.type === 'button' ? 'Button' : 'Text';
  }
  if (el.type === 'image') return 'Image';
  if (el.type === 'logo') return 'Logo';
  return (el.shape ?? 'Shape').charAt(0).toUpperCase() + (el.shape ?? 'Shape').slice(1);
}

export default function LayersPanel({ elements, selectedId, onSelect, onMoveUp, onMoveDown, onDuplicate, onDelete, onFocusImage, focusedImageId }: Props) {
  const ordered = [...elements].reverse();

  return (
    <div className="flex h-full w-60 flex-col border-l border-[var(--color-border)] bg-white">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Layers</h2>
        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">Top layer renders first.</p>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {ordered.length === 0 && (
          <p className="px-2 py-3 text-xs text-[var(--color-text-muted)]">
            No layers yet — add text, images, shapes or a button from the toolbar.
          </p>
        )}
        {ordered.map((el, i) => {
          const isFirst = i === 0; // currently topmost
          const isLast = i === ordered.length - 1; // currently bottommost
          const selected = selectedId === el.id;
          const isFocusableImage = (el.type === 'image' || el.type === 'logo') && !!el.imageUrl;
          const imageFocused = focusedImageId === el.id;
          return (
            <div key={el.id} className="space-y-0.5">
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(el.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(el.id);
                  }
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition ${
                  selected
                    ? 'border-[var(--color-primary,#722F37)] bg-[var(--color-primary,#722F37)]/5'
                    : 'border-transparent hover:bg-[var(--color-tint,#F9FAFB)]'
                }`}
              >
                <div className="h-8 w-12 shrink-0 overflow-hidden rounded border border-black/10 bg-white">
                  <div className="relative" style={{ transform: 'scale(0.12)', transformOrigin: 'top left', width: el.width * 0.12 > 48 ? el.width * 0.12 : 48, height: el.height * 0.12 > 32 ? el.height * 0.12 : 32 }}>
                    <RenderElement el={el} scale={0.12} />
                  </div>
                </div>
                <span className={`min-w-0 flex-1 truncate text-xs font-medium ${selected ? 'text-[var(--color-text)]' : 'text-[var(--color-text-muted)]'}`}>
                  {labelFor(el)}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    title="Move layer up (closer to top)"
                    disabled={isFirst}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveUp(el.id);
                    }}
                    className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
                  >
                    <IconArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Move layer down (closer to bottom)"
                    disabled={isLast}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveDown(el.id);
                    }}
                    className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30"
                  >
                    <IconArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicate(el.id);
                    }}
                    className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    <IconCopy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete layer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(el.id);
                    }}
                    className="rounded p-1 text-[var(--color-text-muted)] hover:text-red-600"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {isFocusableImage && (
                <div
                  className={`ml-1.5 flex items-center gap-1 rounded-md border px-2 py-0.5 transition ${
                    imageFocused
                      ? 'border-[var(--color-primary,#722F37)]/50 bg-[var(--color-primary,#722F37)]/5'
                      : 'border-transparent hover:bg-[var(--color-tint,#F9FAFB)]'
                  }`}
                >
                  <span aria-hidden className="text-[9px] leading-none text-[var(--color-text-muted)]">▾</span>
                  <button
                    type="button"
                    onClick={() => onFocusImage?.(el.id)}
                    className={`truncate text-xs ${imageFocused ? 'font-semibold text-[var(--color-primary,#722F37)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                  >
                    Image
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}