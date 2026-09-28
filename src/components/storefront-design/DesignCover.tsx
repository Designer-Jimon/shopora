// SHOPORA — shared Storefront Cover renderer (Part 2).
//
// Renders a StorefrontDesignDoc as a fluid, aspect-preserving hero, in the
// SAME render path the live storefront uses. Two modes:
//
//   • default (no `device`): full responsive cover. Each element is emitted as
//     three variants (base/tablet/mobile) and a small scoped <style> block uses
//     CSS container queries to switch between them at the container's own
//     width — so the storefront hero adapts with ZERO client JavaScript.
//   • `device` set (editor preview): a single, read-only variant at that
//     breakpoint's width — bit-for-bit the same geometry the storefront shows.
//
// The module deliberately has NO 'use client': it renders in server components
// (storefront) and client components (editor previews) alike, and imports only
// pure, shared logic — the editor never ships to storefront visitors.

import type { CSSProperties } from 'react';
import { elementCoverStyle, BREAKPOINTS, fontCssClamped, focalCSS, zoomCSS } from '@/lib/storefront-design/responsive';
import type {
  DeviceId,
  StorefrontCanvas,
  StorefrontDesignDoc,
  StorefrontElement,
} from '@/lib/storefront-design/types';

type Props = {
  doc: StorefrontDesignDoc;
  /** When set, button elements render as links pointing here. */
  buttonHref?: string;
  /** Render ONLY this breakpoint (editor device preview; 'desktop' = base). */
  device?: DeviceId | 'desktop';
  /** Scoping id for the container-query <style>; unique per rendered cover. */
  uid?: string;
  className?: string;
  style?: CSSProperties;
};

const BG_URL_SAFE = (url: string) =>
  `url("${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;

function ElementView({
  el,
  canvas,
  buttonHref,
  variant,
}: {
  el: StorefrontElement;
  canvas: StorefrontCanvas;
  buttonHref?: string;
  variant: DeviceId | 'base';
}) {
  const style = { ...elementCoverStyle(el, variant === 'base' ? 'desktop' : variant, canvas) } as CSSProperties;

  if (el.type === 'text') {
    style.overflow = 'hidden';
    return (
      <div
        data-sf-el={el.id}
        data-sf-variant={variant === 'base' ? 'base' : variant}
        style={style}
      >
        <div className="whitespace-pre-line">{el.text?.trim() ? el.text : 'Text'}</div>
      </div>
    );
  }

  if (el.type === 'button') {
    const content = el.text || 'Shop now';
    const variantId = variant === 'base' ? 'base' : variant;
    if (buttonHref) {
      return (
        <a
          href={buttonHref}
          data-sf-el={el.id}
          data-sf-variant={variantId}
          style={style}
        >
          {content}
        </a>
      );
    }
    return (
      <div data-sf-el={el.id} data-sf-variant={variantId} style={style}>
        {content}
      </div>
    );
  }

  if (el.type === 'image' || el.type === 'logo') {
    const variantId = variant === 'base' ? 'base' : variant;
    if (!el.imageUrl) {
      style.display = 'flex';
      style.alignItems = 'center';
      style.justifyContent = 'center';
      style.background = '#E5E7EB';
      style.color = '#9CA3AF';
      style.fontWeight = 700;
      style.fontSize = canvas && canvas.width ? fontCssClamped(Math.max(8, el.width * 0.08), canvas.width) : 24;
      style.letterSpacing = 1;
      return (
        <div data-sf-el={el.id} data-sf-variant={variantId} style={style}>
          {el.type === 'logo' ? 'LOGO' : 'IMAGE'}
        </div>
      );
    }
    return (
      <div data-sf-el={el.id} data-sf-variant={variantId} style={{ ...style, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={el.imageUrl}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: el.objectFit ?? 'cover',
            objectPosition: focalCSS(el),
            display: 'block',
            ...zoomCSS(el),
          }}
        />
      </div>
    );
  }

  // shape
  const variantId = variant === 'base' ? 'base' : variant;
  if (el.shape === 'line') {
    return (
      <div data-sf-el={el.id} data-sf-variant={variantId} style={{ ...style, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: '100%',
            height: canvas ? fontCssClamped(el.lineThickness ?? 8, canvas.width) : undefined,
            backgroundColor: el.backgroundColor ?? '#E5E7EB',
          }}
        />
      </div>
    );
  }
  return <div data-sf-el={el.id} data-sf-variant={variantId} style={style} />;
}

export default function DesignCover({ doc, buttonHref, device, uid = 'cover', className, style }: Props) {
  const { canvas, elements } = doc;
  const bgImage = canvas.background.type === 'image' && canvas.background.imageUrl
    ? canvas.background.imageUrl
    : null;

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: `${canvas.width} / ${canvas.height}`,
    overflow: 'hidden',
    backgroundColor: bgImage ? undefined : canvas.background.color,
    ...(device ? {} : { containerType: 'inline-size' as const }),
    ...style,
  };

  const singleVariant = device ?? 'base';

  const variantRules = `
[data-sf-cover="${uid}"] [data-sf-variant="tablet"],
[data-sf-cover="${uid}"] [data-sf-variant="mobile"] { display: none; }
@container (max-width: ${BREAKPOINTS.mobileMax}px) {
  [data-sf-cover="${uid}"] [data-sf-variant="base"],
  [data-sf-cover="${uid}"] [data-sf-variant="tablet"] { display: none !important; }
}
@container (min-width: ${BREAKPOINTS.mobileMax + 1}px) and (max-width: ${BREAKPOINTS.tabletMax}px) {
  [data-sf-cover="${uid}"] [data-sf-variant="base"],
  [data-sf-cover="${uid}"] [data-sf-variant="mobile"] { display: none !important; }
}
@container (min-width: ${BREAKPOINTS.tabletMax + 1}px) {
  [data-sf-cover="${uid}"] [data-sf-variant="tablet"],
  [data-sf-cover="${uid}"] [data-sf-variant="mobile"] { display: none !important; }
}
`;

  return (
    <div
      data-sf-cover={uid}
      className={className}
      style={device ? { ...rootStyle, containerType: undefined } : rootStyle}
    >
      {bgImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            backgroundImage: BG_URL_SAFE(bgImage),
            backgroundSize: 'cover',
            backgroundPosition: focalCSS(canvas.background),
            ...zoomCSS(canvas.background),
          }}
        />
      )}
      {elements.map((el) =>
        device ? (
          <ElementView key={el.id} el={el} canvas={canvas} buttonHref={buttonHref} variant={singleVariant as DeviceId} />
        ) : (
          <div key={el.id} style={{ position: 'absolute', inset: 0 }}>
            <ElementView el={el} canvas={canvas} buttonHref={buttonHref} variant="base" />
            <ElementView el={el} canvas={canvas} buttonHref={buttonHref} variant="tablet" />
            <ElementView el={el} canvas={canvas} buttonHref={buttonHref} variant="mobile" />
          </div>
        ),
      )}
      {!device && <style>{variantRules}</style>}
    </div>
  );
}