// Renders a single StorefrontElement at a given geometry `scale` (1 = design
// px, <1 = live preview/thumbnail). Shared by the interactive canvas (selection
// + drag decorated via props) and the static DesignThumb tiles.

import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { StorefrontElement } from '@/lib/storefront-design/types';
import { focalCSS, zoomCSS } from '@/lib/storefront-design/responsive';

type Props = {
  el: StorefrontElement;
  scale: number;
  interactive?: boolean;
  selected?: boolean;
  /** This element's image content is the active focal-pan target. */
  panActive?: boolean;
  onDoubleClick?: () => void;
  onPointerDown?: (e: ReactPointerEvent) => void;
  onPointerMove?: (e: ReactPointerEvent) => void;
  onPointerUp?: (e: ReactPointerEvent) => void;
  onPointerCancel?: (e: ReactPointerEvent) => void;
  onWheel?: (e: ReactWheelEvent) => void;
};

const SELECT_RING = '2px solid #2563EB';
const PAN_RING = '2px dashed #059669';

export default function RenderElement({ el, scale, interactive, selected, panActive, onDoubleClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel }: Props) {
  const style: CSSProperties = {
    position: 'absolute',
    left: el.x * scale,
    top: el.y * scale,
    width: el.width * scale,
    height: el.height * scale,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
    opacity: el.opacity / 100,
  };
  const rootProps: Record<string, unknown> = {};
  if (interactive) {
    rootProps['data-sf-el'] = el.id;
    style.cursor = panActive ? 'grab' : 'move';
    style.touchAction = 'none';
    if (panActive) {
      style.outline = PAN_RING;
      style.outlineOffset = -1;
      style.zIndex = 9000;
    } else if (selected) {
      style.outline = SELECT_RING;
      style.outlineOffset = -1;
      style.zIndex = 9000;
    }
    if (onPointerDown) rootProps.onPointerDown = onPointerDown;
    if (onPointerMove) rootProps.onPointerMove = onPointerMove;
    if (onPointerUp) rootProps.onPointerUp = onPointerUp;
    if (onPointerCancel) rootProps.onPointerCancel = onPointerCancel;
    if (onDoubleClick) rootProps.onDoubleClick = onDoubleClick;
    if (onWheel) rootProps.onWheel = onWheel;
  }

  if (el.type === 'text') {
    style.display = 'flex';
    style.alignItems = 'center';
    if (el.textAlign === 'center') {
      style.justifyContent = 'center';
      style.textAlign = 'center';
    } else if (el.textAlign === 'right') {
      style.justifyContent = 'flex-end';
      style.textAlign = 'right';
    } else {
      style.textAlign = 'left';
    }
    style.fontFamily = el.fontFamily;
    style.fontSize = (el.fontSize ?? 56) * scale;
    style.fontWeight = el.fontWeight ?? 800;
    style.color = el.color ?? '#1A1A1A';
    style.lineHeight = 1.2;
    style.overflow = 'hidden';
    return (
      <div style={style} {...rootProps}>
        <div className="whitespace-pre-line">{el.text?.trim() ? el.text : 'Text'}</div>
      </div>
    );
  }

  if (el.type === 'button') {
    style.fontFamily = el.fontFamily;
    style.fontSize = (el.fontSize ?? 20) * scale;
    style.fontWeight = 700;
    style.color = el.color ?? '#FFFFFF';
    style.backgroundColor = el.backgroundColor ?? '#722F37';
    style.borderRadius = (el.borderRadius ?? 10) * scale;
    style.display = 'flex';
    style.alignItems = 'center';
    style.justifyContent = 'center';
    style.textAlign = 'center';
    return (
      <div style={style} {...rootProps}>
        {el.text || 'Shop now'}
      </div>
    );
  }

  if (el.type === 'image' || el.type === 'logo') {
    const src = el.imageUrl;
    if (!src) {
      return (
        <div
          style={{
            ...style,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#E5E7EB',
            color: '#9CA3AF',
            fontWeight: 700,
            fontSize: Math.max(8, el.width * 0.08) * scale,
            letterSpacing: 1,
          }}
          {...rootProps}
        >
          {el.type === 'logo' ? 'LOGO' : 'IMAGE'}
        </div>
      );
    }
    return (
      <div style={{ ...style, overflow: 'hidden' }} {...rootProps}>
        <img
          src={src}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: el.objectFit ?? 'cover',
            objectPosition: focalCSS(el),
            display: 'block',
            pointerEvents: 'none',
            ...zoomCSS(el),
          }}
          draggable={false}
        />
      </div>
    );
  }

  // shape
  const kind = el.shape ?? 'rectangle';
  if (kind === 'line') {
    const thickness = Math.max(1, (el.lineThickness ?? 8) * scale);
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center' }} {...rootProps}>
        <div
          style={{
            width: '100%',
            height: thickness,
            backgroundColor: el.backgroundColor ?? '#E5E7EB',
          }}
        />
      </div>
    );
  }

  let borderRadius: number | string = 0;
  if (kind === 'circle') borderRadius = '50%';
  else if (kind === 'rounded') borderRadius = (el.borderRadius ?? 12) * scale;

  return <div style={{ ...style, backgroundColor: el.backgroundColor ?? '#E5E7EB', borderRadius }} {...rootProps} />;
}