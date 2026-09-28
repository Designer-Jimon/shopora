'use client';

// Read-only, single-breakpoint preview of a design, rendered by the SAME
// DesignCover the live storefront uses. Shown in the Desktop/Tablet/Mobile
// tabs so merchants can verify their responsive layout before publishing.

import DesignCover from '@/components/storefront-design/DesignCover';
import { previewWidthFor } from '@/lib/storefront-design/responsive';
import type { DeviceId, StorefrontDesignDoc } from '@/lib/storefront-design/types';

type Props = {
  doc: StorefrontDesignDoc;
  device: DeviceId | 'desktop';
};

export default function DevicePreview({ doc, device }: Props) {
  const width = previewWidthFor(device, doc.canvas);

  return (
    <div
      className="flex min-h-0 flex-1 items-start justify-center overflow-auto"
      style={{
        background:
          'radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px), var(--color-tint, #F3F4F6)',
        backgroundSize: '20px 20px',
      }}
    >
      <div className="my-8" style={{ width: Math.min(width, 1000), maxWidth: '100%' }}>
        <DesignCover doc={doc} device={device} uid={`preview-${device}`} />
        <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {device} · {width}px preview
        </p>
      </div>
    </div>
  );
}