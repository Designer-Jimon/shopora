// SHOPORA Storefront Design Studio — responsive resolution + safe zone (Part 2).
//
// Makes NO assumptions about rendering technology: it returns plain geometry
// numbers and CSS strings so the SAME resolution logic drives
//   • the live storefront hero (server-rendered, container-query CSS),
//   • the editor's Desktop/Tablet/Mobile device previews (React, fixed widths).
//
// Model:
//   • The desktop canvas is the MASTER. All un-overridden geometry scales by
//     `s = renderWidth / canvas.width`, so the whole design always fits the
//     render width (hero never clips on narrow phones).
//   • A tablet/mobile override on an element is DEVICE-LOCAL px (values were
//     authored against that breakpoint's preview). Overridden fields replace
//     the master field before scaling; un-overridden fields inherit.
//   • Typography floor: rendered text is never smaller than TEXT_FLOOR × the
//     authored font size (absolute px), even when geometry shrinks — keeps
//     headlines legible on phones. Geometry is unaffected by the floor.
//   • Safe zone: a centered guide band merchants are nudged to keep important
//     content inside. Content outside it still renders everywhere (scale-to-fit
//     never clips), but may sit close to the edges on narrow screens.

import type {
  DeviceId,
  DeviceOverride,
  StorefrontCanvas,
  StorefrontElement,
} from './types';

export const TEXT_FLOOR = 0.6;

/** Storefront breakpoint bounds (CSS px). Base/desktop applies above tabletMax. */
export const BREAKPOINTS = { tabletMax: 1023, mobileMax: 639 } as const;

/** Preview widths used by the editor device tabs (must match live rendering). */
export const TABLET_PREVIEW_WIDTH = 768;
export const MOBILE_PREVIEW_WIDTH = 390;

export const DEVICE_IDS_WITH_DESKTOP: (DeviceId | 'desktop')[] = ['desktop', 'tablet', 'mobile'];

export const DEVICE_LABELS: Record<DeviceId, string> = {
  tablet: 'Tablet',
  mobile: 'Mobile',
};

/** Editor preview width for a breakpoint; desktop previews at the canvas itself. */
export function previewWidthFor(device: DeviceId | 'desktop', canvas: StorefrontCanvas): number {
  if (device === 'tablet') return TABLET_PREVIEW_WIDTH;
  if (device === 'mobile') return MOBILE_PREVIEW_WIDTH;
  return canvas.width;
}

// ---------------------------------------------------------------------------
// Safe zone (editor guide)
// ---------------------------------------------------------------------------

/** Editorial safe-area insets as fractions of the canvas (centered band). */
export const SAFE_ZONE = { insetX: 0.08, insetY: 0.12 } as const;

export type SafeZoneRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Safe-zone band in canvas (design) px — the square the editor overlay draws. */
export function safeZoneBounds(canvas: StorefrontCanvas): SafeZoneRect {
  const left = Math.round(canvas.width * SAFE_ZONE.insetX);
  const top = Math.round(canvas.height * SAFE_ZONE.insetY);
  return {
    left,
    top,
    width: Math.round(canvas.width * (1 - SAFE_ZONE.insetX * 2)),
    height: Math.round(canvas.height * (1 - SAFE_ZONE.insetY * 2)),
  };
}

// ---------------------------------------------------------------------------
// Resolution (pure, server + client safe)
// ---------------------------------------------------------------------------

const num = (v: number | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** The override map that applies for a breakpoint (desktop has none). */
export function overrideFor(
  el: StorefrontElement,
  device: DeviceId | 'desktop',
): DeviceOverride | undefined {
  if (device === 'desktop') return undefined;
  return el.responsive?.[device];
}

/**
 * Geometry (CSS px at `renderWidth`) for a single element at a breakpoint.
 * `scale` is the element's px-per-design-px (the character of the render),
 * `fontSizeCss` already applies the typography floor.
 */
export type ResolvedElement = {
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  scale: number;
  fontSizeCss?: number;
  requiresFloor: boolean;
};

export function resolveElement(
  el: StorefrontElement,
  device: DeviceId | 'desktop',
  renderWidth: number,
  canvas: StorefrontCanvas,
): ResolvedElement {
  const ov = overrideFor(el, device);
  const s = renderWidth / canvas.width;

  const x = num(ov?.x, el.x);
  const y = num(ov?.y, el.y);
  const w = num(ov?.width, el.width);
  const h = num(ov?.height, el.height);

  const res: ResolvedElement = {
    left: x * s,
    top: y * s,
    width: w * s,
    height: h * s,
    opacity: num(ov?.opacity, el.opacity) / 100,
    rotation: num(ov?.rotation, el.rotation),
    scale: s,
    requiresFloor: false,
  };

  if (el.type === 'text' || el.type === 'button') {
    const fs = num(ov?.fontSize, el.fontSize ?? (el.type === 'button' ? 20 : 56));
    const textScale = device === 'desktop' ? s : Math.max(s, TEXT_FLOOR);
    res.fontSizeCss = fs * textScale;
    res.requiresFloor = textScale > s;
  }

  return res;
}

// ---------------------------------------------------------------------------
// CSS-string builders (container-query flavour) for the live cover renderer.
// Geometry uses percentages of the cover box; lengths use 1cqw = 1% cover
// width, so the whole design scales fluently with the hero element with zero
// JavaScript on the storefront.
// ---------------------------------------------------------------------------

const pct = (v: number, total: number): string => `${(v / total) * 100}%`;
const cqw = (v: number, w: number): string => `calc(${v} / ${w} * 100cqw)`;

/** Font-size value with the typography floor baked in (absolute px floor). */
export const fontCssClamped = (v: number, canvasWidth: number): string =>
  `calc(max(${v} / ${canvasWidth} * 100cqw, ${Math.round(v * TEXT_FLOOR)}px))`;

/** CSS focal point (background-position / object-position) from 0–100 % values. */
export const focalCSS = (source: { focalX?: number; focalY?: number }): string =>
  `${source.focalX ?? 50}% ${source.focalY ?? 50}%`;

/**
 * Zoom CSS for image content that fills its frame (bg image layer or element
 * <img>). Scaling is anchored at the focal point, so panning (focalX/focalY,
 * object/background-position %) and zooming (this) compose into one
 * "see-through-window" model shared by the editor canvas and the storefront.
 * Returns {} at the default zoom so fit-to-frame renders exactly as before.
 */
export const zoomCSS = (source: { focalX?: number; focalY?: number; zoom?: number }): Record<string, string> => {
  const z = source.zoom && source.zoom !== 100 ? source.zoom / 100 : undefined;
  return z
    ? { transform: `scale(${z})`, transformOrigin: focalCSS(source) }
    : {};
};

/**
 * Build the inline CSS of one element variant for the cover renderer. Values
 * are strings/numbers React can apply directly; safe for SSR and hydration.
 */
export function elementCoverStyle(
  el: StorefrontElement,
  device: DeviceId | 'desktop',
  canvas: StorefrontCanvas,
): Record<string, string | number> {
  const ov = overrideFor(el, device);
  const x = num(ov?.x, el.x);
  const y = num(ov?.y, el.y);
  const w = num(ov?.width, el.width);
  const h = num(ov?.height, el.height);
  const opacity = num(ov?.opacity, el.opacity) / 100;
  const rotation = num(ov?.rotation, el.rotation);

  const style: Record<string, string | number> = {
    position: 'absolute',
    left: pct(x, canvas.width),
    top: pct(y, canvas.height),
    width: pct(w, canvas.width),
    height: pct(h, canvas.height),
    opacity,
    zIndex: el.zIndex,
  };
  if (rotation) style.transform = `rotate(${rotation}deg)`;

  if (el.type === 'text' || el.type === 'button') {
    const fs = num(ov?.fontSize, el.fontSize ?? (el.type === 'button' ? 20 : 56));
    style.fontFamily = el.fontFamily ?? "Inter, 'Segoe UI', system-ui, sans-serif";
    style.fontSize = fontCssClamped(fs, canvas.width);
    style.fontWeight = el.fontWeight ?? (el.type === 'button' ? 700 : 800);
    style.color = el.color ?? (el.type === 'button' ? '#FFFFFF' : '#1A1A1A');
    style.lineHeight = 1.2;
    style.display = 'flex';
    style.alignItems = 'center';
    if (el.type === 'text') {
      if (el.textAlign === 'center') {
        style.justifyContent = 'center';
        style.textAlign = 'center';
      } else if (el.textAlign === 'right') {
        style.justifyContent = 'flex-end';
        style.textAlign = 'right';
      } else {
        style.textAlign = 'left';
      }
    } else {
      style.justifyContent = 'center';
      style.textAlign = 'center';
      style.backgroundColor = el.backgroundColor ?? '#722F37';
      style.borderRadius = cqw(el.borderRadius ?? 10, canvas.width);
      style.overflow = 'hidden';
    }
  }

  if (el.type === 'shape') {
    style.backgroundColor = el.backgroundColor ?? '#E5E7EB';
    if (el.shape === 'circle') style.borderRadius = '50%';
    else if (el.shape === 'rounded') style.borderRadius = cqw(el.borderRadius ?? 12, canvas.width);
  }

  return style;
}