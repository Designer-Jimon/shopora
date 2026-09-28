// SHOPORA Storefront Design Studio — template library (Part 1).
//
// Eight clean, professional starting points the merchant opens from and then
// replaces the text/images/colors/CTA live in the editor — no code involved.
// Templates are PURE DATA (no server-only imports) so the client editor and
// the API routes both import this module. Instantiation (`applyTemplate`)
// deep-clones the doc with fresh element ids so two merchants never share ids.

import {
  blankDoc,
  reindexZ,
  uid,
  type StorefrontDesignDoc,
  type StorefrontElement,
} from './types';

export type DesignTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  accent: string; // swatch used on the template card
  doc: StorefrontDesignDoc;
};

const W = 1200;
const H = 600;

type TextOpts = Partial<Pick<StorefrontElement, 'text' | 'fontSize' | 'fontWeight' | 'fontFamily' | 'textAlign' | 'color' | 'x' | 'y' | 'width' | 'height'>> &
  { type?: 'text' };

function textEl(opts: TextOpts): StorefrontElement {
  return {
    id: uid(),
    type: 'text',
    x: 0,
    y: 0,
    width: W,
    height: 120,
    rotation: 0,
    opacity: 100,
    zIndex: 0,
    text: '',
    fontSize: 56,
    fontWeight: 800,
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
    textAlign: 'center',
    color: '#1A1A1A',
    ...opts,
  };
}

function buttonEl(opts: Partial<StorefrontElement>): StorefrontElement {
  return {
    id: uid(),
    type: 'button',
    x: (W - 220) / 2,
    y: H - 120,
    width: 220,
    height: 64,
    rotation: 0,
    opacity: 100,
    zIndex: 0,
    text: 'Shop now',
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
    textAlign: 'center',
    color: '#FFFFFF',
    backgroundColor: '#722F37',
    borderRadius: 10,
    ...opts,
  };
}

function shapeEl(opts: Partial<StorefrontElement> & { shape: 'rectangle' | 'rounded' | 'circle' | 'line' }): StorefrontElement {
  return {
    id: uid(),
    type: 'shape',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: opts.width ?? 120,
    height: opts.height ?? 120,
    rotation: opts.rotation ?? 0,
    opacity: opts.opacity ?? 100,
    zIndex: opts.zIndex ?? 0,
    shape: opts.shape,
    backgroundColor: opts.backgroundColor ?? '#E5E7EB',
    lineThickness: opts.lineThickness ?? 8,
  };
}

type Tpl = {
  name: string;
  category: string;
  description: string;
  accent: string;
  build: () => StorefrontElement[];
};

const TPL_DEFS: Tpl[] = [
  {
    name: 'General Business',
    category: 'Business',
    description: 'A clean, trustworthy header for any store.',
    accent: '#722F37',
    build: () => [
      shapeEl({ shape: 'rectangle', x: 0, y: H - 16, width: 320, height: 16, backgroundColor: '#722F37' }),
      textEl({ y: 200, fontSize: 72, text: 'Your store name', textAlign: 'center' }),
      textEl({ y: 292, height: 76, fontSize: 26, fontWeight: 500, color: '#4B5563', text: 'Quality you can trust — delivered to your door.', textAlign: 'center' }),
      buttonEl({ y: H - 150 }),
    ],
  },
  {
    name: 'Fashion',
    category: 'Fashion',
    description: 'Serif sophistication with a warm neutral backdrop.',
    accent: '#3F3A36',
    build: () => [
      textEl({ y: 200, width: W, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400, fontSize: 68, text: 'Autumn Collection', textAlign: 'center' }),
      shapeEl({ shape: 'line', x: (W - 240) / 2, y: 296, width: 240, height: 4, lineThickness: 4, backgroundColor: '#3F3A36' }),
      textEl({ y: 316, height: 64, fontSize: 22, fontWeight: 400, color: '#5F5750', text: 'Timeless pieces, made to last.', textAlign: 'center' }),
      buttonEl({ y: H - 150, backgroundColor: '#1A1A1A' }),
    ],
  },
  {
    name: 'Electronics',
    category: 'Electronics',
    description: 'Bold on dark — made for sleek product lines.',
    accent: '#0EA5E9',
    build: () => [
      textEl({ y: 196, fontSize: 66, color: '#F9FAFB', text: 'Next-Gen Gadgets', textAlign: 'center' }),
      textEl({ y: 282, height: 64, fontSize: 24, fontWeight: 400, color: '#9CA3AF', text: 'Fast, reliable, built to last.', textAlign: 'center' }),
      shapeEl({ shape: 'rectangle', x: 0, y: 0, width: W, height: H, backgroundColor: '#101418', zIndex: -1 }),
      buttonEl({ y: H - 150, backgroundColor: '#F9FAFB', color: '#101418' }),
    ],
  },
  {
    name: 'Food & Restaurant',
    category: 'Food & Restaurant',
    description: 'Warm and appetising with a playful plate accent.',
    accent: '#EA7C3C',
    build: () => [
      shapeEl({ shape: 'circle', x: W - 300, y: 80, width: 180, height: 180, backgroundColor: '#FEF3C7' }),
      shapeEl({ shape: 'circle', x: W - 260, y: 120, width: 100, height: 100, backgroundColor: '#F59E0B' }),
      textEl({ y: 204, width: 760, text: 'Delicious food, made fresh', textAlign: 'left' }),
      textEl({ y: 296, width: 760, height: 64, fontSize: 24, fontWeight: 400, color: '#57534E', text: 'Order ahead and skip the queue.', textAlign: 'left' }),
      buttonEl({ x: 100, y: H - 150, backgroundColor: '#EA7C3C' }),
    ],
  },
  {
    name: 'Beauty',
    category: 'Beauty',
    description: 'Soft, elegant, feminine accents on blush.',
    accent: '#D16BA5',
    build: () => [
      shapeEl({ shape: 'circle', x: 100, y: 60, width: 200, height: 200, backgroundColor: '#FBCFE8', opacity: 60 }),
      textEl({ y: 196, width: W, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400, fontSize: 64, text: 'Glow with confidence', textAlign: 'center' }),
      textEl({ y: 288, width: W, height: 60, fontSize: 22, fontWeight: 400, color: '#6B4A5A', text: 'Clean beauty essentials for your daily ritual.', textAlign: 'center' }),
      buttonEl({ y: H - 150, backgroundColor: '#D16BA5' }),
    ],
  },
  {
    name: 'Services',
    category: 'Services',
    description: 'Professional and reassuring for service businesses.',
    accent: '#1D4ED8',
    build: () => [
      textEl({ y: 200, fontSize: 64, text: 'Expert services you can rely on', textAlign: 'center' }),
      textEl({ y: 288, width: W, height: 64, fontSize: 24, fontWeight: 400, color: '#6B7280', text: 'Trusted professionals, transparent pricing.', textAlign: 'center' }),
      shapeEl({ shape: 'rectangle', x: (W - 90) / 2, y: 120, width: 90, height: 8, backgroundColor: '#1D4ED8' }),
      buttonEl({ y: H - 150, backgroundColor: '#1D4ED8', text: 'Book now' }),
    ],
  },
  {
    name: 'Promotional / Sale',
    category: 'Promotional / Sale',
    description: 'High-impact sale banner in store red.',
    accent: '#722F37',
    build: () => [
      shapeEl({ shape: 'rectangle', x: 0, y: 0, width: W, height: H, backgroundColor: '#722F37', zIndex: -1 }),
      textEl({ y: 170, width: W, fontSize: 84, color: '#FFFFFF', text: 'MEGA SALE', textAlign: 'center' }),
      textEl({ y: 276, width: W, height: 64, fontSize: 26, fontWeight: 400, color: '#FADBD9', text: 'Up to 50% off everything.', textAlign: 'center' }),
      buttonEl({ y: H - 150, backgroundColor: '#FFFFFF', color: '#722F37' }),
    ],
  },
  {
    name: 'New Arrivals',
    category: 'New Arrivals',
    description: 'Fresh, left-aligned, discovery-first header.',
    accent: '#15803D',
    build: () => [
      shapeEl({ shape: 'line', x: 100, y: 176, width: 120, height: 6, lineThickness: 6, backgroundColor: '#15803D' }),
      textEl({ x: 100, y: 200, width: 620, fontSize: 62, text: 'New arrivals just landed', textAlign: 'left' }),
      textEl({ x: 100, y: 292, width: 620, height: 64, fontSize: 24, fontWeight: 400, color: '#52525B', text: 'Be the first to shop the latest drop.', textAlign: 'left' }),
      buttonEl({ x: 100, y: H - 150, backgroundColor: '#15803D' }),
    ],
  },
];

function buildTemplate(t: Tpl): DesignTemplate {
  const elements = reindexZ(t.build());
  const doc = blankDoc();
  for (const el of elements) {
    if (el.zIndex < 0) {
      // full-bleed background piece → move it behind everything
      doc.elements.unshift({ ...el, zIndex: 0 });
    } else {
      doc.elements.push(el);
    }
  }
  doc.elements = reindexZ(doc.elements);
  doc.canvas.background.color = shapedBg(t.name) ?? doc.canvas.background.color;
  return {
    id: slugFromName(t.name),
    name: t.name,
    category: t.category,
    description: t.description,
    accent: t.accent,
    doc,
  };
}

function shapedBg(name: string): string | null {
  if (name === 'Electronics') return '#101418';
  if (name === 'Promotional / Sale') return '#722F37';
  if (name === 'Fashion') return '#F7F2ED';
  if (name === 'Food & Restaurant') return '#FFF7ED';
  if (name === 'Beauty') return '#FDF2F8';
  return null;
}

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const TEMPLATES: DesignTemplate[] = TPL_DEFS.map(buildTemplate);

export function findTemplate(id: string): DesignTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * Instantiate a template into a standalone design doc — deep copy with fresh
 * element ids so the merchant's copy never collides with the library or with
 * another merchant's copy.
 */
export function applyTemplate(id: string): StorefrontDesignDoc | null {
  const t = findTemplate(id);
  if (!t) return null;
  return {
    canvas: JSON.parse(JSON.stringify(t.doc.canvas)),
    elements: t.doc.elements.map((el) => ({ ...JSON.parse(JSON.stringify(el)), id: uid() })),
  };
}