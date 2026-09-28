'use client';

// Interactive design canvas. Measures its container and scales the fixed-size
// design (default 1200×600) to fit, honouring an optional absolute zoom %
// (0 = fit). Elements are selectable (click), draggable (pointer capture) and
// resizable via 8 edge/corner handles; drags report live geometry to the
// editor and commit on pointer-up so undo/redo snapshots once per gesture.

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import RenderElement from './renderElement';
import { ELEMENT_LIMITS, clampFocal, clampZoom } from '@/lib/storefront-design/types';
import type { StorefrontCanvas, StorefrontElement } from '@/lib/storefront-design/types';
import { safeZoneBounds } from '@/lib/storefront-design/responsive';
import { focalCSS, zoomCSS } from '@/lib/storefront-design/responsive';

export type PanTarget = { type: 'element'; id: string } | { type: 'background' } | null;

type Props = {
  canvas: StorefrontCanvas;
  elements: StorefrontElement[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, g: { x: number; y: number; width: number; height: number }) => void;
  onMoveEnd: () => void;
  zoom: number; // 0 = fit-to-container, otherwise percent (100/75/50…)
  onFitScale?: (scale: number) => void;
  /** Draw the Part 2 safe-zone guide band over the canvas. */
  showGuides?: boolean;
  /** Active focal-pan target: dragging the image inside a fixed frame (or the
   * stage background) pans focalX/focalY instead of moving/resizing the frame. */
  pan?: PanTarget;
  onPanElement?: (id: string, focalX: number, focalY: number) => void;
  onPanBackground?: (focalX: number, focalY: number) => void;
  onEnterPan?: (target: { type: 'element'; id: string } | { type: 'background' }) => void;
  /** Wheel-to-zoom while a target is in pan mode (element image / background). */
  onZoomElement?: (id: string, zoom: number) => void;
  onZoomBackground?: (zoom: number) => void;
};

const PAD = 48;
const MAX_FIT = 1; // never upscale beyond design px in fit mode
const HANDLE = 12;

type HandleKey = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const HANDLES: HandleKey[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type DragStart = {
  id: string;
  mode: 'move' | 'resize' | 'pan-el' | 'pan-bg';
  handle?: HandleKey;
  px: number;
  py: number;
  start: { x: number; y: number; width: number; height: number };
  startFocal?: { fx: number; fy: number };
  startZoom?: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function resizeGeom(
  start: DragStart['start'],
  handle: HandleKey,
  dx: number,
  dy: number,
): { x: number; y: number; width: number; height: number } {
  let x = start.x;
  let y = start.y;
  let width = start.width;
  let height = start.height;
  const minW = ELEMENT_LIMITS.minSize;
  const maxW = ELEMENT_LIMITS.maxSize;
  const minH = ELEMENT_LIMITS.minSize;
  const maxH = ELEMENT_LIMITS.maxSize;
  if (handle === 'e' || handle === 'ne' || handle === 'se') {
    width = clamp(start.width + dx, minW, maxW);
  } else if (handle === 'w' || handle === 'nw' || handle === 'sw') {
    width = clamp(start.width - dx, minW, maxW);
    x = start.x + start.width - width;
  }
  if (handle === 's' || handle === 'se' || handle === 'sw') {
    height = clamp(start.height + dy, minH, maxH);
  } else if (handle === 'n' || handle === 'ne' || handle === 'nw') {
    height = clamp(start.height - dy, minH, maxH);
    y = start.y + start.height - height;
  }
  return {
    x: Math.round(clamp(x, ELEMENT_LIMITS.minX, ELEMENT_LIMITS.maxX)),
    y: Math.round(clamp(y, ELEMENT_LIMITS.minY, ELEMENT_LIMITS.maxY)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Small +/- stepper used by the pan-mode zoom HUD on the canvas. */
function ZoomStepButton({
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
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 6,
        border: '1px solid rgba(0,0,0,0.12)',
        background: '#FFFFFF',
        color: '#1A1A1A',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

const handlePos = (k: HandleKey): CSSProperties => {
  const half = HANDLE / 2;
  const midX = 'calc(50% - ' + half + 'px)';
  const midY = 'calc(50% - ' + half + 'px)';
  switch (k) {
    case 'nw': return { left: -half, top: -half };
    case 'n': return { left: midX, top: -half };
    case 'ne': return { right: -half, top: -half };
    case 'e': return { right: -half, top: midY };
    case 'se': return { right: -half, bottom: -half };
    case 's': return { left: midX, bottom: -half };
    case 'sw': return { left: -half, bottom: -half };
    case 'w': return { left: -half, top: midY };
  }
};

export default function DesignCanvas({ canvas, elements, selectedId, onSelect, onMove, onResize, onMoveEnd, zoom, onFitScale, showGuides, pan, onPanElement, onPanBackground, onEnterPan, onZoomElement, onZoomBackground }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const dragRef = useRef<DragStart | null>(null);
  const wheelAccum = useRef(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const compute = () => {
      const w = node.clientWidth - PAD * 2;
      const h = node.clientHeight - PAD * 2;
      if (w <= 0 || h <= 0) return;
      const s = Math.min(MAX_FIT, canvas.width > 0 ? w / canvas.width : 1, canvas.height > 0 ? h / canvas.height : 1);
      setFitScale(s);
      onFitScale?.(s);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(node);
    return () => ro.disconnect();
  }, [canvas.width, canvas.height, onFitScale]);

  const scale = zoom > 0 ? zoom / 100 : fitScale;
  const eff = scale;

  const bg = canvas.background;
  const bgImage = bg.type === 'image' && bg.imageUrl ? bg.imageUrl : null;

  const stageW = canvas.width * scale;
  const stageH = canvas.height * scale;

  const onWinPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.px) / eff;
      const dy = (e.clientY - drag.py) / eff;
      if (drag.mode === 'pan-el' || drag.mode === 'pan-bg') {
        // At zoom z the visible image region overhangs the frame by (z-1)×frames;
        // scale the focal step so the pushed content tracks the cursor 1:1 and
        // the 0–100 focal clamp still maps edge-to-edge of the zoomed band.
        // At z = 1 there is no overhang, so keep the unzoomed focal step.
        const z = (drag.startZoom ?? 100) / 100;
        const zf = z > 1 ? z - 1 : 1;
        const fx = clampFocal((drag.startFocal?.fx ?? 50) - (dx * 100) / (drag.start.width * zf), 50);
        const fy = clampFocal((drag.startFocal?.fy ?? 50) - (dy * 100) / (drag.start.height * zf), 50);
        if (drag.mode === 'pan-el') onPanElement?.(drag.id, fx, fy);
        else onPanBackground?.(fx, fy);
        return;
      }
      if (drag.mode === 'move') {
        const nx = clamp(drag.start.x + dx, ELEMENT_LIMITS.minX, ELEMENT_LIMITS.maxX);
        const ny = clamp(drag.start.y + dy, ELEMENT_LIMITS.minY, ELEMENT_LIMITS.maxY);
        onMove(drag.id, Math.round(nx), Math.round(ny));
        return;
      }
      if (!drag.handle) return;
      onResize(drag.id, resizeGeom(drag.start, drag.handle, dx, dy));
    },
    [eff, onMove, onResize, onPanElement, onPanBackground],
  );

  const onWinPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', onWinPointerMove);
    window.removeEventListener('pointerup', onWinPointerUp);
    window.removeEventListener('pointercancel', onWinPointerUp);
    onMoveEnd();
  }, [onWinPointerMove, onMoveEnd]);

  const attachWindowListeners = useCallback(() => {
    window.addEventListener('pointermove', onWinPointerMove);
    window.addEventListener('pointerup', onWinPointerUp);
    window.addEventListener('pointercancel', onWinPointerUp);
  }, [onWinPointerMove, onWinPointerUp]);

  const beginDrag = useCallback(
    (e: ReactPointerEvent, el: StorefrontElement, mode: DragStart['mode'], handle?: HandleKey) => {
      e.stopPropagation();
      onSelect(el.id);
      if (e.button !== 0) return;
      dragRef.current = {
        id: el.id,
        mode,
        ...(handle ? { handle } : {}),
        px: e.clientX,
        py: e.clientY,
        start: { x: el.x, y: el.y, width: el.width, height: el.height },
      };
      attachWindowListeners();
    },
    [onSelect, attachWindowListeners],
  );

  const beginPanEl = (e: ReactPointerEvent, el: StorefrontElement) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = {
      id: el.id,
      mode: 'pan-el',
      px: e.clientX,
      py: e.clientY,
      start: { x: el.x, y: el.y, width: el.width, height: el.height },
      startFocal: { fx: el.focalX ?? 50, fy: el.focalY ?? 50 },
      startZoom: el.zoom ?? 100,
    };
    attachWindowListeners();
  };

  const beginPanBg = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = {
      id: '',
      mode: 'pan-bg',
      px: e.clientX,
      py: e.clientY,
      start: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      startFocal: { fx: bg.focalX ?? 50, fy: bg.focalY ?? 50 },
      startZoom: bg.zoom ?? 100,
    };
    attachWindowListeners();
  };

  const selectedEl = selectedId ? elements.find((el) => el.id === selectedId) : null;
  const panningElement = pan?.type === 'element';
  const panEl = panningElement ? elements.find((el) => el.id === pan?.id) ?? null : null;
  /** Live zoom % of the current pan target (the Properties panel field mirrors it). */
  const panZoom = pan?.type === 'background' ? bg.zoom ?? 100 : panEl?.zoom ?? 100;

  /** ±25% content zoom on the pan target, clamped to the supported range. */
  const stepPanZoom = (delta: number) => {
    const next = clampZoom(panZoom + delta, 100);
    if (next === panZoom) return;
    if (pan?.type === 'background') onZoomBackground?.(next);
    else if (pan?.type === 'element') onZoomElement?.(pan.id, next);
  };

  // Wheel while a target is in pan mode steps the content zoom (±5% per notch,
  // accumulated so trackpad deltas don't fire dozens of tiny steps; scrolling
  // up zooms IN, like every other canvas). The wheel is consumed so the
  // surrounding canvas container doesn't scroll.
  const wheelZoom = (e: ReactWheelEvent, target: { type: 'element'; id: string } | { type: 'background' }) => {
    e.preventDefault();
    e.stopPropagation();
    wheelAccum.current += e.deltaY;
    if (Math.abs(wheelAccum.current) < 80) return;
    const step = -5 * Math.sign(wheelAccum.current);
    wheelAccum.current = 0;
    if (target.type === 'background') {
      onZoomBackground?.(clampZoom((bg.zoom ?? 100) + step, 100));
    } else {
      const el = elements.find((el) => el.id === target.id);
      if (el) onZoomElement?.(target.id, clampZoom((el.zoom ?? 100) + step, 100));
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto"
      style={{
        background: 'var(--color-tint, #F3F4F6)',
        backgroundImage:
          'radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      <div style={{ minWidth: stageW + PAD * 2, minHeight: stageH + PAD * 2, padding: PAD, width: '100%', height: '100%', boxSizing: 'border-box' }}
        className="flex items-start justify-center">
        <div
          data-sf-stage={selectedId ?? ''}
          style={{
            position: 'relative',
            width: stageW,
            height: stageH,
            backgroundColor: bgImage ? undefined : bg.color,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18), 0 8px 30px rgba(0,0,0,0.10)',
            flexShrink: 0,
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (pan?.type === 'background') {
              beginPanBg(e);
              return;
            }
            onSelect(null);
          }}
          onDoubleClick={() => {
            if (!selectedId && bgImage && pan?.type !== 'background') onEnterPan?.({ type: 'background' });
          }}
          onWheel={pan?.type === 'background' ? (e) => wheelZoom(e, { type: 'background' }) : undefined}
        >
          {bgImage ? (
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              <div
                data-sf-bg
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundImage: `url(${bgImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: focalCSS(bg),
                  ...zoomCSS(bg),
                }}
              />
            </div>
          ) : null}
          {elements.map((el) => (
            <RenderElement
              key={el.id}
              el={el}
              scale={eff}
              interactive
              selected={selectedId === el.id}
              panActive={panningElement && pan?.type === 'element' && pan.id === el.id}
              onPointerDown={(e) => (panningElement && pan?.type === 'element' && pan.id === el.id ? beginPanEl(e, el) : beginDrag(e, el, 'move'))}
              onDoubleClick={() => {
                if ((el.type === 'image' || el.type === 'logo') && el.imageUrl) onEnterPan?.({ type: 'element', id: el.id });
              }}
              onWheel={panningElement && pan?.type === 'element' && pan.id === el.id ? (e) => wheelZoom(e, { type: 'element', id: el.id }) : undefined}
            />
          ))}
          {selectedEl && !(panningElement && pan?.type === 'element' && pan.id === selectedEl.id) ? (
            <div
              data-sf-resize="overlay"
              style={{
                position: 'absolute',
                left: selectedEl.x * scale,
                top: selectedEl.y * scale,
                width: selectedEl.width * scale,
                height: selectedEl.height * scale,
                zIndex: 9001,
                pointerEvents: 'none',
              }}
            >
              {HANDLES.map((k) => (
                <div
                  key={k}
                  data-sf-handle={k}
                  onPointerDown={(e) => beginDrag(e, selectedEl, 'resize', k)}
                  style={{
                    position: 'absolute',
                    width: HANDLE,
                    height: HANDLE,
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    border: '1.5px solid #2563EB',
                    borderRadius: 3,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    pointerEvents: 'auto',
                    touchAction: 'none',
                    ...handlePos(k),
                  }}
                />
              ))}
            </div>
          ) : null}
          {showGuides ? (
            (() => {
              const b = safeZoneBounds(canvas);
              return (
                <div
                  data-sf-guides
                  style={{
                    position: 'absolute',
                    left: b.left * scale,
                    top: b.top * scale,
                    width: b.width * scale,
                    height: b.height * scale,
                    zIndex: 8999,
                    pointerEvents: 'none',
                    border: '1.5px dashed rgba(37, 99, 235, 0.55)',
                  }}
                >
                  <div style={{ position: 'absolute', inset: 6, border: '1px dashed rgba(37, 99, 235, 0.22)' }} />
                </div>
              );
            })()
          ) : null}
          {pan ? (
            <div
              data-sf-zoom-hud={pan.type}
              onPointerDown={(e) => e.stopPropagation()}
              onWheel={(e) => wheelZoom(e, pan.type === 'background' ? { type: 'background' } : { type: 'element', id: pan.id })}
              style={{
                position: 'absolute',
                right: 8,
                top: 8,
                zIndex: 9500,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 4,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.94)',
                border: '1px solid rgba(0,0,0,0.12)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.14)',
                touchAction: 'none',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6B7280', padding: '0 4px' }}>
                Zoom
              </span>
              <ZoomStepButton title="Zoom out (−25%)" disabled={panZoom <= ELEMENT_LIMITS.minZoom} onClick={() => stepPanZoom(-25)}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>-</span>
              </ZoomStepButton>
              <span
                data-sf-zoom-value={panZoom}
                style={{ minWidth: 38, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#1A1A1A', fontVariantNumeric: 'tabular-nums' }}
              >
                {panZoom}%
              </span>
              <ZoomStepButton title="Zoom in (+25%)" disabled={panZoom >= ELEMENT_LIMITS.maxZoom} onClick={() => stepPanZoom(25)}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>+</span>
              </ZoomStepButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}