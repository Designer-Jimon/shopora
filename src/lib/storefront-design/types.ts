// SHOPORA Storefront Design Studio — canonical design-document contract.
//
// A design is a STRUCTURED JSON document (never an HTML string), exactly like
// Business.themeConfig: the editor round-trips it as plain objects and the API
// validates + sanitizes it on every write. Part 2 (responsive preview + publish
// flow) will extend the per-element `responsive` key and the design-level
// `metadata` column WITHOUT a schema change — this module owns the shared
// contract so both halves stay in sync.

export type ElementType = 'text' | 'image' | 'shape' | 'button' | 'logo';
export type TextAlign = 'left' | 'center' | 'right';
export type ObjectFit = 'cover' | 'contain';
export type ShapeKind = 'rectangle' | 'rounded' | 'circle' | 'line';

export type Background = {
  type: 'color' | 'image';
  color: string;
  imageUrl?: string;
  /** Focal point of a background image as percentages (0–100, default 50/50). */
  focalX?: number;
  focalY?: number;
  /** Image zoom as a percentage of fit-to-frame (100–300, 100 = fit). */
  zoom?: number;
};

export type StorefrontCanvas = {
  width: number;
  height: number;
  background: Background;
};

export type StorefrontElement = {
  id: string;
  type: ElementType;
  // geometry (canvas px, top-left origin; y grows downward)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees (0 = upright); Part 1 exposes a numeric rotate control
  opacity: number;  // 0–100
  zIndex: number;   // normalized to array index on save
  // text / button shared
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string; // css font-family from FONT_CHOICES
  textAlign?: TextAlign;
  color?: string; // hex
  // image / logo
  imageUrl?: string;
  objectFit?: ObjectFit;
  /** Focal point of an image/logo element as percentages (0–100, default 50/50). */
  focalX?: number;
  focalY?: number;
  /** Image zoom as a percentage of fit-to-frame (100–300, 100 = fit). */
  zoom?: number;
  // shape / button
  shape?: ShapeKind;
  backgroundColor?: string; // hex
  borderRadius?: number;
  lineThickness?: number; // for shape 'line'
  // Part 2: optional per-breakpoint overrides. Keyed by breakpoint id, values
  // are device-local px (the canvas is the fractal desktop master). When a
  // key is missing on a given breakpoint the element inherits the desktop
  // value. Sanitized server-side on every write.
  responsive?: Partial<Record<DeviceId, DeviceOverride>>;
};

// ── Part 2 responsive contract ────────────────────────────────────────────────
// The desktop canvas is the MASTER geometry; tablet/mobile overrides reposition
// individual elements for narrow screens. Stored inside el.responsive so the
// DB schema, API shape and DesignDto are unchanged from Part 1.

/** Breakpoints that can carry per-element overrides (desktop = the base values). */
export type DeviceId = 'tablet' | 'mobile';

/** Optional per-breakpoint geometry (device-local px; matches ELEMENT_LIMITS). */
export type DeviceOverride = Partial<{
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  opacity: number;
  rotation: number;
}>;

export const DEVICE_IDS: DeviceId[] = ['tablet', 'mobile'];

const OVERRIDE_KEYS = ['x', 'y', 'width', 'height', 'fontSize', 'opacity', 'rotation'] as const;

/**
 * Validate + clamp a raw `responsive` payload into the typed override map.
 * Unknown keys are dropped and out-of-range numbers are clamped — identical
 * policy to the rest of sanitizeElement. Returns undefined when empty so a
 * clean element never carries a dead object.
 */
export function sanitizeResponsive(raw: unknown): Partial<Record<DeviceId, DeviceOverride>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Partial<Record<DeviceId, DeviceOverride>> = {};
  const src = raw as Record<string, unknown>;
  for (const device of DEVICE_IDS) {
    const entry = src[device];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const o: DeviceOverride = {};
    for (const key of OVERRIDE_KEYS) {
      const v = e[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      if (key === 'width' || key === 'height') o[key] = clamp(v, ELEMENT_LIMITS.minSize, ELEMENT_LIMITS.maxSize, 100);
      else if (key === 'fontSize') o[key] = clamp(v, ELEMENT_LIMITS.minFont, ELEMENT_LIMITS.maxFont, 56);
      else if (key === 'opacity') o[key] = clamp(v, ELEMENT_LIMITS.minOpacity, ELEMENT_LIMITS.maxOpacity, 100);
      else if (key === 'rotation') o[key] = clamp(v, ELEMENT_LIMITS.minRotation, ELEMENT_LIMITS.maxRotation, 0);
      else o[key] = clamp(v, ELEMENT_LIMITS.minX, ELEMENT_LIMITS.maxX, 0);
    }
    if (Object.keys(o).length > 0) out[device] = o;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type StorefrontDesignDoc = {
  canvas: StorefrontCanvas;
  elements: StorefrontElement[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CANVAS_SIZE = { width: 1200, height: 600 };

export const MAX_ELEMENTS = 200;
export const MAX_TEXT_LENGTH = 2000;

export const CANVAS_LIMITS = { minWidth: 800, maxWidth: 2400, minHeight: 400, maxHeight: 1600 };
export const ELEMENT_LIMITS = {
  minX: -1600, maxX: 4000,
  minY: -1600, maxY: 4000,
  minSize: 8, maxSize: 2000,
  minFont: 8, maxFont: 400,
  minOpacity: 0, maxOpacity: 100,
  minRotation: 0, maxRotation: 360,
  maxRadius: 200,
  minZoom: 100, maxZoom: 300,
};

export const FONT_CHOICES: { label: string; family: string }[] = [
  { label: 'Inter', family: "Inter, 'Segoe UI', system-ui, sans-serif" },
  { label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet MS', family: "'Trebuchet MS', 'Segoe UI', sans-serif" },
  { label: 'Georgia', family: "Georgia, 'Times New Roman', serif" },
  { label: 'Times New Roman', family: "'Times New Roman', Times, serif" },
  { label: 'Courier New', family: "'Courier New', Courier, monospace" },
];

const FONT_WEIGHTS = [400, 500, 600, 700, 800, 900];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function blankDoc(): StorefrontDesignDoc {
  return {
    canvas: {
      width: DEFAULT_CANVAS_SIZE.width,
      height: DEFAULT_CANVAS_SIZE.height,
      background: { type: 'color', color: '#ffffff' },
    },
    elements: [],
  };
}

/** Re-index zIndex to the array order (later element = on top). */
export function reindexZ(elements: StorefrontElement[]): StorefrontElement[] {
  return elements.map((el, i) => ({ ...el, zIndex: i }));
}

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());

export function clampFocal(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

/** Clamp an image zoom percentage into the supported 100–300 fit-to-frame range. */
export function clampZoom(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : Number(v);
  return Number.isFinite(n)
    ? Math.min(ELEMENT_LIMITS.maxZoom, Math.max(ELEMENT_LIMITS.minZoom, n))
    : fallback;
}

function sanitizeBackground(b: unknown): Background {
  const raw = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  const type = raw.type === 'image' ? 'image' : 'color';
  const focalX =
    raw.focalX !== undefined ? clampFocal(raw.focalX, 50) : undefined;
  const focalY =
    raw.focalY !== undefined ? clampFocal(raw.focalY, 50) : undefined;
  if (type === 'image') {
    return {
      type: 'image',
      color: isHex(raw.color) ? (raw.color as string).toUpperCase() : '#ffffff',
      imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.trim() ? raw.imageUrl.trim() : undefined,
      ...(focalX !== undefined ? { focalX } : {}),
      ...(focalY !== undefined ? { focalY } : {}),
      ...(raw.zoom !== undefined ? { zoom: clampZoom(raw.zoom, 100) } : {}),
    };
  }
  return { type: 'color', color: isHex(raw.color) ? (raw.color as string).toUpperCase() : '#ffffff' };
}

/**
 * Normalize a single element into the canonical shape, clamping numbers and
 * dropping anything not in the contract. Unknown extra keys are discarded
 * (only `responsive` JSON is preserved for Part 2). Returns null when the
 * element is fundamentally unusable (bad type / no id).
 */
export function sanitizeElement(raw: unknown): StorefrontElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as ElementType;
  if (!['text', 'image', 'shape', 'button', 'logo'].includes(type)) return null;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id : uid();

  const el: StorefrontElement = {
    id,
    type,
    x: clamp(r.x, ELEMENT_LIMITS.minX, ELEMENT_LIMITS.maxX, 0),
    y: clamp(r.y, ELEMENT_LIMITS.minY, ELEMENT_LIMITS.maxY, 0),
    width: clamp(r.width, ELEMENT_LIMITS.minSize, ELEMENT_LIMITS.maxSize, 100),
    height: clamp(r.height, ELEMENT_LIMITS.minSize, ELEMENT_LIMITS.maxSize, 50),
    rotation: clamp(r.rotation, ELEMENT_LIMITS.minRotation, ELEMENT_LIMITS.maxRotation, 0),
    opacity: clamp(r.opacity, ELEMENT_LIMITS.minOpacity, ELEMENT_LIMITS.maxOpacity, 100),
    zIndex: clamp(r.zIndex, 0, MAX_ELEMENTS - 1, 0),
  };

  if (r.responsive && typeof r.responsive === 'object') {
    el.responsive = sanitizeResponsive(r.responsive);
  }

  if (type === 'text' || type === 'button') {
    el.text = typeof r.text === 'string' ? r.text.slice(0, MAX_TEXT_LENGTH) : type === 'button' ? 'Shop now' : '';
    el.fontSize = clamp(r.fontSize, ELEMENT_LIMITS.minFont, ELEMENT_LIMITS.maxFont, type === 'button' ? 20 : 56);
    const w = FONT_WEIGHTS.includes(r.fontWeight as number) ? (r.fontWeight as number) : 700;
    el.fontWeight = w;
    el.fontFamily = typeof r.fontFamily === 'string' && r.fontFamily ? r.fontFamily : FONT_CHOICES[0].family;
    el.textAlign = ['left', 'center', 'right'].includes(r.textAlign as string) ? (r.textAlign as TextAlign) : 'left';
    el.color = isHex(r.color) ? (r.color as string).toUpperCase() : type === 'button' ? '#FFFFFF' : '#1A1A1A';
  }

  if (type === 'image' || type === 'logo') {
    el.imageUrl = typeof r.imageUrl === 'string' && r.imageUrl.trim() ? r.imageUrl.trim() : undefined;
    el.objectFit = r.objectFit === 'contain' ? 'contain' : 'cover';
    const focalX = r.focalX !== undefined ? clampFocal(r.focalX, 50) : undefined;
    const focalY = r.focalY !== undefined ? clampFocal(r.focalY, 50) : undefined;
    if (focalX !== undefined) el.focalX = focalX;
    if (focalY !== undefined) el.focalY = focalY;
    const zoom = r.zoom !== undefined ? clampZoom(r.zoom, 100) : undefined;
    if (zoom !== undefined) el.zoom = zoom;
  }

  if (type === 'shape' || type === 'button') {
    const shape = r.shape as ShapeKind;
    el.shape = ['rectangle', 'rounded', 'circle', 'line'].includes(shape) ? shape : type === 'button' ? 'rounded' : 'rectangle';
    el.backgroundColor = isHex(r.backgroundColor) ? (r.backgroundColor as string).toUpperCase() : '#E5E7EB';
    el.lineThickness = clamp(r.lineThickness, 1, 100, 8);
  }

  if (type === 'button') {
    el.borderRadius = clamp(r.borderRadius, 0, ELEMENT_LIMITS.maxRadius, 8);
  }
  if (type === 'shape' && el.shape === 'rounded') {
    el.borderRadius = clamp(r.borderRadius, 0, ELEMENT_LIMITS.maxRadius, 12);
  }

  return el;
}

export type DesignDocValidation =
  | { ok: true; doc: StorefrontDesignDoc }
  | { ok: false; errors: string[] };

/**
 * Validate + sanitize an incoming design document. Used by the API routes on
 * every create/update so malformed or hostile payloads are both rejected
 * (unparseable) and normalized (realistic). Sanitized or not, the returned doc
 * always has sane canvas bounds and ≤ MAX_ELEMENTS elements.
 */
export function sanitizeDesignDoc(raw: unknown): DesignDocValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Design document is missing'] };

  const r = raw as Record<string, unknown>;
  const canvasRaw = r.canvas as Record<string, unknown>;
  if (!canvasRaw || typeof canvasRaw !== 'object') return { ok: false, errors: ['Canvas configuration is missing'] };

  const canvas = {
    width: clamp(canvasRaw.width, CANVAS_LIMITS.minWidth, CANVAS_LIMITS.maxWidth, DEFAULT_CANVAS_SIZE.width),
    height: clamp(canvasRaw.height, CANVAS_LIMITS.minHeight, CANVAS_LIMITS.maxHeight, DEFAULT_CANVAS_SIZE.height),
    background: sanitizeBackground(canvasRaw.background),
  };

  if (!Array.isArray(r.elements)) return { ok: false, errors: ['Elements must be an array'] };

  let elements: StorefrontElement[] = [];
  const errors: string[] = [];
  for (const elRaw of r.elements) {
    const el = sanitizeElement(elRaw);
    if (el) elements.push(el);
  }
  if (elements.length > MAX_ELEMENTS) {
    errors.push(`Too many elements (max ${MAX_ELEMENTS})`);
    elements = elements.slice(0, MAX_ELEMENTS);
  }

  elements = reindexZ(elements);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, doc: { canvas, elements } };
}

/** Human-friendly limits bundle for the editor UI. */
export const LIMITS = {
  maxElements: MAX_ELEMENTS,
  minW: ELEMENT_LIMITS.minSize,
  minH: ELEMENT_LIMITS.minSize,
};