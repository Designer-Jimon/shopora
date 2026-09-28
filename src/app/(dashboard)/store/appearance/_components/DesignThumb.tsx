'use client';

// Static, non-interactive thumbnail of a design document, scaled to fit a
// fixed box. Used for template cards and saved-design tiles on the Design
// Studio home.

import RenderElement from './renderElement';
import { focalCSS, zoomCSS } from '@/lib/storefront-design/responsive';
import type { StorefrontDesignDoc } from '@/lib/storefront-design/types';

type Props = {
  doc: StorefrontDesignDoc;
  className?: string;
  backgroundThemed?: boolean;
};

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 200;

export default function DesignThumb({ doc, className }: Props) {
  const { canvas, elements } = doc;
  const scale = Math.min(VIEW_WIDTH / canvas.width, VIEW_HEIGHT / canvas.height);
  const pad = 0; // keep thumbnails flush; the tile card provides its own frame

  const bg = canvas.background;
  const bgImage = bg.type === 'image' && bg.imageUrl ? bg.imageUrl : null;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: VIEW_WIDTH,
        height: VIEW_HEIGHT,
        overflow: 'hidden',
        backgroundColor: bgImage ? undefined : bg.color,
      }}
    >
      {bgImage ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: focalCSS(bg),
            ...zoomCSS(bg),
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: pad,
          top: pad,
          width: canvas.width * scale,
          height: canvas.height * scale,
        }}
      >
        {elements.map((el) => (
          <RenderElement key={el.id} el={el} scale={scale} />
        ))}
      </div>
    </div>
  );
}