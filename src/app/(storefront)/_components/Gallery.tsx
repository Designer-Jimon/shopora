'use client';

import { useState } from 'react';

type GalleryImage = { id: string; url: string; position: number };

export default function Gallery({
  images,
  alt,
}: {
  images: GalleryImage[];
  alt: string;
}) {
  const sorted = [...images].sort((a, b) => a.position - b.position);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  if (sorted.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--sf-tint)]">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
          No image
        </span>
      </div>
    );
  }

  const active = sorted[Math.min(index, sorted.length - 1)];

  return (
    <div>
      <div className="aspect-square w-full overflow-hidden rounded-lg bg-[var(--sf-tint)]" style={{ borderColor: 'var(--sf-border)' }}>
        {!failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.url}
            alt={alt}
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[var(--sf-tint)]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--sf-muted)]">
              No image
            </span>
          </div>
        )}
      </div>

      {sorted.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, i) => (
            <button
              key={img.id}
              type="button"
              aria-label={`Image ${i + 1}`}
              onClick={() => {
                setIndex(i);
                setFailed(false);
              }}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 bg-[var(--sf-tint)] ${
                i === index ? 'border-[var(--sf-primary)]' : ''
              }`}
              style={{ borderColor: i === index ? 'var(--sf-primary)' : 'var(--sf-border)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}